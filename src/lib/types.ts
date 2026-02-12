export interface Client {
  id: string;
  user_id: string;
  full_name: string;
  cpf_or_identifier: string | null;
  phone: string;
  email: string | null;
  notes: string | null;
  created_at: string;
}

export interface Case {
  id: string;
  user_id: string;
  client_id: string;
  case_title: string;
  defendant: string | null;
  case_type: string | null;
  court: string | null;
  process_number: string | null;
  distribution_date: string | null;
  partner_law_firm_name: string | null;
  partner_lawyer_name: string | null;
  company_context: string | null;
  status: string;
  created_at: string;
  clients?: Client;
}

export interface Document {
  id: string;
  case_id: string;
  user_id: string;
  doc_type: string | null;
  file_url: string | null;
  extracted_text: string | null;
  extracted_json: Record<string, any> | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  case_id: string;
  user_id: string;
  channel: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  user_id: string;
  sender: string;
  message_text: string;
  created_at: string;
}

export interface AiOutput {
  id: string;
  case_id: string;
  user_id: string;
  output_type: string;
  content: string;
  confidence_score: number | null;
  scam_risk: string | null;
  rationale: string | null;
  created_at: string;
}

export const STATUS_OPTIONS = [
  { value: "triagem", label: "Triagem", color: "bg-info" },
  { value: "em_contato", label: "Em Contato", color: "bg-warning" },
  { value: "aguardando_resposta", label: "Aguardando Resposta", color: "bg-muted" },
  { value: "em_andamento", label: "Em Andamento", color: "bg-primary" },
  { value: "finalizado", label: "Finalizado", color: "bg-success" },
] as const;

export function getStatusInfo(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0];
}
