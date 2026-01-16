import { kafka } from '../services/kafka';
import { transporter } from '../services/emailService';
import fs from 'fs';
import handlebars from 'handlebars';

const consumer = kafka.consumer({ groupId: 'chamado-group' });

function renderTemplate(templatePath: string, data: object) {
  const templateStr = fs.readFileSync(templatePath, 'utf-8');
  const template = handlebars.compile(templateStr);
  return template(data);
}

async function sendChamadoAbertoEmail(chamado: any) {
  const html = renderTemplate(
    'src/templates/chamado-aberto.hbs',
    {
      nomeUsuario: chamado.nomeUsuario,
      idChamado: chamado.id,
      assuntoChamado: chamado.assunto,
      dataAbertura: chamado.dataAbertura
    }
  );
  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"Help Me" <noreply@helpme.com>',
    to: chamado.emailUsuario,
    subject: `Seu chamado #${chamado.id} foi aberto!`,
    html
  });
}

async function sendChamadoEncerradoEmail(chamado: any) {
  const html = renderTemplate(
    'src/templates/chamado-encerrado.hbs',
    {
      nomeUsuario: chamado.nomeUsuario,
      idChamado: chamado.id,
      assuntoChamado: chamado.assunto,
      dataAbertura: chamado.dataAbertura,
      dataEncerramento: chamado.dataEncerramento
    }
  );
  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"Help Me" <noreply@helpme.com>',
    to: chamado.emailUsuario,
    subject: `Seu chamado #${chamado.id} foi encerrado`,
    html
  });
}

export async function startChamadoConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'chamado-status' });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const data = JSON.parse(message.value!.toString());

      // Usar templates
      if (data.status === 'ABERTO') {
        await sendChamadoAbertoEmail(data);
      }

      if (data.status === 'ENCERRADO') {
        await sendChamadoEncerradoEmail(data);
      }
    }
  });
}
