import mongoose, { Schema, Document } from 'mongoose';

export type TipoEvento =
  | 'CHAMADO_ABERTO'
  | 'CHAMADO_ATRIBUIDO'
  | 'CHAMADO_TRANSFERIDO'
  | 'CHAMADO_REABERTO'
  | 'PRIORIDADE_ALTERADA'
  | 'SLA_VENCENDO'
  | 'CHAMADO_ENCERRADO';

export interface INotificacao extends Document {
  destinatarioId: string;
  destinatarioEmail: string;
  tipo: TipoEvento;
  titulo: string;
  mensagem: string;
  chamadoId: string;
  chamadoOS: string;
  dadosExtras?: Record<string, any>;
  lida: boolean;
  lidaEm?: Date;
  criadoEm: Date;
}

const NotificacaoSchema = new Schema<INotificacao>({
  destinatarioId:    { type: String, required: true, index: true },
  destinatarioEmail: { type: String, required: true },
  tipo:              { type: String, required: true, enum: [
    'CHAMADO_ABERTO', 'CHAMADO_ATRIBUIDO', 'CHAMADO_TRANSFERIDO',
    'CHAMADO_REABERTO', 'PRIORIDADE_ALTERADA', 'SLA_VENCENDO', 'CHAMADO_ENCERRADO'
  ]},
  titulo:     { type: String, required: true },
  mensagem:   { type: String, required: true },
  chamadoId:  { type: String, required: true, index: true },
  chamadoOS:  { type: String, required: true },
  dadosExtras: { type: Schema.Types.Mixed },
  lida:   { type: Boolean, default: false, index: true },
  lidaEm: { type: Date },
  criadoEm: { type: Date, default: Date.now, index: true },
});

NotificacaoSchema.index({ destinatarioId: 1, lida: 1, criadoEm: -1 });

export default mongoose.model<INotificacao>('notificacoes', NotificacaoSchema);