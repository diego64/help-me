import mongoose from 'mongoose';

const atualizacaoDoChamado = new mongoose.Schema({
  chamadoId: { type: String, required: true },
  dataHora: { type: Date, default: Date.now },
  tipo: { type: String, required: true },
  de: String,
  para: String,
  descricao: String,
  autorId: { type: String, required: true },
  autorNome: String,
  autorEmail: String
});

export default mongoose.model('AtualizacaoDoChamado', atualizacaoDoChamado);