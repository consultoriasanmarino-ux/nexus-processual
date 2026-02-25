import subprocess
import os
import sys
import time

def run_bridge():
    bridge_path = os.path.join(os.getcwd(), "whatsapp-bridge")
    server_js = os.path.join(bridge_path, "server.js")

    print("="*50)
    print("NEXUS WHATSAPP BRIDGE - LAUNCHER")
    print("="*50)

    if not os.path.exists(server_js):
        print(f"Error: {server_js} not found.")
        return

    process = None
    try:
        print("Starting Node.js server...")
        # Start the node process with pipe for stdout
        process = subprocess.Popen(
            ["node", "server.js"], 
            cwd=bridge_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )

        print("--- NEXUS WHATSAPP BRIDGE STARTED ---")
        print("\n" + "!"*60)
        print(">>> THE QR CODE IS NOW AVAILABLE IN TWO WAYS:")
        print("1. ON SCREEN: Go to the site -> Settings -> WhatsApp")
        print("2. IN PDF: Open 'whatsapp-bridge/conectar_whatsapp.pdf'")
        print("!"*60 + "\n")

        # Properly handle potential None for stdout
        if process.stdout is not None:
            for line in process.stdout:
                # Filter out raw terminal codes that might be ugly
                if "--- ESCANEIE" in line:
                    print("\n[SYSTEM] QR Code generated. Check the website or the PDF file.\n")
                elif "Image saved" in line or "PDF" in line or "connected" in line.lower():
                    print(line.strip())
            
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        if process: process.terminate()
    finally:
        if process:
            process.terminate()

if __name__ == "__main__":
    run_bridge()
