import { Message as WbotMessage } from "whatsapp-web.js";
import SetTicketMessagesAsRead from "../../../helpers/SetTicketMessagesAsRead";
import { getIO } from "../../../libs/socket";
import Ticket from "../../../models/Ticket";
import { sleepRandomTime } from "../../../utils/sleepRandomTime";
import CreateAutoReplyLogsService from "../../AutoReplyServices/CreateAutoReplyLogsService";
import ShowStepAutoReplyMessageService from "../../AutoReplyServices/ShowStepAutoReplyMessageService";
import VerifyActionStepAutoReplyService from "../../AutoReplyServices/VerifyActionStepAutoReplyService";
import SendWhatsAppMessage from "../SendWhatsAppMessage";

const verifyAutoReplyActionTicket = async (
  msg: WbotMessage,
  ticket: Ticket
): Promise<void> => {
  const celularContato = ticket.contact.number;
  let celularTeste = "";

  if (
    ticket.autoReplyId &&
    ticket.status === "pending" &&
    !msg.fromMe &&
    !ticket.isGroup
  ) {
    if (ticket.autoReplyId) {
      const stepAutoReplyAtual = await ShowStepAutoReplyMessageService(
        0,
        ticket.autoReplyId,
        ticket.stepAutoReplyId,
        undefined,
        ticket.tenantId
      );
      const actionAutoReply = await VerifyActionStepAutoReplyService(
        ticket.stepAutoReplyId,
        msg.body,
        ticket.tenantId
      );
      if (actionAutoReply) {
        const io = getIO();

        await CreateAutoReplyLogsService(stepAutoReplyAtual, ticket, msg.body);

        // action = 0: enviar para proximo step: nextStepId
        if (actionAutoReply.action === 0) {
          await ticket.update({
            stepAutoReplyId: actionAutoReply.nextStepId
          });
          const stepAutoReply = await ShowStepAutoReplyMessageService(
            0,
            ticket.autoReplyId,
            actionAutoReply.nextStepId,
            undefined,
            ticket.tenantId
          );

          // Verificar se rotina em teste
          celularTeste = stepAutoReply.autoReply.celularTeste;
          if (
            (celularTeste &&
              celularContato?.indexOf(celularTeste.substr(1)) === -1) ||
            !celularContato
          ) {
            return;
          }

          await sleepRandomTime({
            minMilliseconds: +(process.env.MIN_SLEEP_AUTO_REPLY || 4000),
            maxMilliseconds: +(process.env.MAX_SLEEP_AUTO_REPLY || 6000)
          });
          await SendWhatsAppMessage({
            body: stepAutoReply.reply,
            ticket,
            quotedMsg: undefined
          });
          await SetTicketMessagesAsRead(ticket);
          return;
        }

        // action = 1: enviar para fila: queue
        if (actionAutoReply.action === 1) {
          ticket.update({
            queueId: actionAutoReply.queueId,
            autoReplyId: null,
            stepAutoReplyId: null
          });
        }

        // action = 2: enviar para determinado usuário
        if (actionAutoReply.action === 2) {
          ticket.update({
            userId: actionAutoReply.userIdDestination,
            status: "open",
            autoReplyId: null,
            stepAutoReplyId: null
          });
        }
        io.to(`${ticket.tenantId}-${ticket.status}`).emit(
          `${ticket.tenantId}-ticket`,
          {
            action: "updateQueue",
            ticket
          }
        );

        if (actionAutoReply.replyDefinition) {
          await sleepRandomTime({
            minMilliseconds: +(process.env.MIN_SLEEP_AUTO_REPLY || 4000),
            maxMilliseconds: +(process.env.MAX_SLEEP_AUTO_REPLY || 6000)
          });
          await SendWhatsAppMessage({
            body: actionAutoReply.replyDefinition,
            ticket,
            quotedMsg: undefined
          });
          await SetTicketMessagesAsRead(ticket);
        }
      } else {
        // Verificar se rotina em teste
        celularTeste = stepAutoReplyAtual.autoReply.celularTeste;
        if (
          (celularTeste &&
            celularContato?.indexOf(celularTeste.substr(1)) === -1) ||
          !celularContato
        ) {
          return;
        }

        // se ticket tiver sido criado, ingnorar na primeria passagem
        if (!ticket.isCreated) {
          await sleepRandomTime({
            minMilliseconds: +(process.env.MIN_SLEEP_AUTO_REPLY || 4000),
            maxMilliseconds: +(process.env.MAX_SLEEP_AUTO_REPLY || 6000)
          });
          await SendWhatsAppMessage({
            body:
              "Desculpe! Não entendi sua resposta. Vamos tentar novamente! Escolha uma opção válida.",
            ticket,
            quotedMsg: undefined
          });
        }

        await sleepRandomTime({
          minMilliseconds: +(process.env.MIN_SLEEP_AUTO_REPLY || 4000),
          maxMilliseconds: +(process.env.MAX_SLEEP_AUTO_REPLY || 6000)
        });
        await SendWhatsAppMessage({
          body: stepAutoReplyAtual.reply,
          ticket,
          quotedMsg: undefined
        });
        await SetTicketMessagesAsRead(ticket);
      }
    }
  }
};

export default verifyAutoReplyActionTicket;
