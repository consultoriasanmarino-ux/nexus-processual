const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

const app = express();
app.use(cors());
app.use(express.json());

let sock = null;
let qrCodeValue = null;
let connectionStatus = 'disconnected';

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // We'll handle it manually to show in logs if needed
        logger: pino({ level: 'silent' }),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeValue = qr;
            console.log('\n--- NOVO QR CODE GERADO ---');
            qrcodeTerminal.generate(qr, { small: true });

            const imgPath = path.join(__dirname, 'conectar_whatsapp.png');
            const pdfPath = path.join(__dirname, 'conectar_whatsapp.pdf');

            QRCode.toFile(imgPath, qr, (err) => {
                if (!err) {
                    const doc = new PDFDocument();
                    doc.pipe(fs.createWriteStream(pdfPath));
                    doc.fontSize(20).text('Escaneie para conectar o Nexus', { align: 'center' });
                    doc.image(imgPath, { fit: [400, 400], align: 'center' });
                    doc.end();
                }
            });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            connectionStatus = 'disconnected';
            const shouldReconnect = statusCode !== 401;
            console.log(`Conexão fechada. Motivo: ${statusCode}. Reconectando: ${shouldReconnect}`);

            if (shouldReconnect) {
                // Se for conflito de stream (409), esperamos um pouco mais
                const delayMs = statusCode === 409 ? 5000 : 0;
                setTimeout(() => connectToWhatsApp(), delayMs);
            } else {
                console.log('Sessão inválida (401). Limpando dados para novo login.');
                fs.rmSync(path.join(__dirname, 'auth_info_baileys'), { recursive: true, force: true });
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            connectionStatus = 'connected';
            qrCodeValue = null;
            console.log('\n✅ WhatsApp TOTALMENTE CONECTADO E ATIVO!\n');
        }
    });
}

// Routes
app.get('/status', (req, res) => {
    res.json({
        active: connectionStatus === 'connected',
        status: connectionStatus,
        hasQr: !!qrCodeValue,
        qrCodeString: qrCodeValue
    });
});

app.post('/verify', async (req, res) => {
    if (connectionStatus !== 'connected') {
        return res.status(503).json({ error: 'WhatsApp não conectado' });
    }

    const { numbers } = req.body;
    if (!Array.isArray(numbers)) return res.status(400).json({ error: 'Array de números esperado' });

    console.log(`Verificando ${numbers.length} números...`);

    try {
        const results = [];
        // Process in batches to avoid overwhelming
        for (let i = 0; i < numbers.length; i++) {
            const originalFull = numbers[i];
            const numDigits = originalFull.replace(/\D/g, '');

            // Clean number for JID (remove 55 if present for logic, then re-add correctly)
            let pureNum = numDigits.startsWith('55') ? numDigits.substring(2) : numDigits;

            // Brazil 9th digit logic is tricky. Let's test standard JID first.
            let variants = [];

            // Variant 1: Exactly as provided (with 55)
            variants.push(numDigits.startsWith('55') ? numDigits : '55' + numDigits);

            // Variant 2: If it's 11 digits (DDD + 9 + 8 digits), try without the 9
            if (pureNum.length === 11 && pureNum[2] === '9') {
                const without9 = pureNum.substring(0, 2) + pureNum.substring(3);
                variants.push('55' + without9);
            }

            // Variant 3: If it's 10 digits (DDD + 8 digits), try WITH the 9
            if (pureNum.length === 10) {
                const with9 = pureNum.substring(0, 2) + '9' + pureNum.substring(2);
                variants.push('55' + with9);
            }

            let found = false;
            for (const v of variants) {
                try {
                    const jid = v + '@s.whatsapp.net';
                    const [result] = await sock.onWhatsApp(jid);
                    if (result && result.exists) {
                        // Crucially return the original string or the formatted digits we found
                        results.push(originalFull);
                        found = true;
                        break;
                    }
                } catch (e) {
                    console.warn(`Erro testando variante ${v}:`, e.message);
                }
            }

            if (!found) {
                console.log(`❌ Número inválido ou sem WhatsApp: ${originalFull}`);
            }

            if (i % 5 === 0 && i > 0) await delay(300);
        }

        res.json({ validNumbers: results });
    } catch (err) {
        console.error('Erro na verificação:', err);
        res.status(500).json({ error: 'Erro interno na verificação' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Nexus WhatsApp Bridge rodando em http://localhost:${PORT}`);
    console.log('Aguardando inicialização do WhatsApp...');
    connectToWhatsApp();
});
