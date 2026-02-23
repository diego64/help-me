import { Types } from 'mongoose';

// Dados de entrada para criar histórico
export interface HistoricoChamadoInput {
  chamadoId: string;
  tipo: string;
  de?: string | null;
  para?: string | null;
  descricao?: string;
  autorId: string;
  autorNome: string;
  autorEmail: string;
}

// Documento completo do histórico no MongoDB
export interface HistoricoChamadoDocument {
  _id: Types.ObjectId | string; // Aceita tanto ObjectId quanto string
  chamadoId: string;
  tipo: string;
  de: string | null;
  para: string | null;
  descricao: string;
  autorId: string;
  autorNome: string;
  autorEmail: string;
  dataHora: Date;
}

// Tipo para o documento retornado pelo Mongoose
export interface HistoricoChamadoMongooseDocument extends Document {
  chamadoId: string;
  tipo: string;
  de?: string | null;
  para?: string | null;
  descricao?: string | null;
  autorId: string;
  autorNome?: string | null;
  autorEmail?: string | null;
  dataHora: Date;
}