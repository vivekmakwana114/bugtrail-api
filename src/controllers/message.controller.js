import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import { messageService } from '../services/index.js';
import { messageSerializer } from '../serializers/index.js';

const listMessages = catchAsync(async (req, res) => {
  const result = await messageService.listMessages(req.user, req.params.bugId, req.query);
  res.send(messageSerializer.messagePage(result));
});

const sendMessage = catchAsync(async (req, res) => {
  const message = await messageService.sendMessage(req.user, req.params.bugId, req.body);
  res.status(httpStatus.CREATED).send(messageSerializer.messageItem(message));
});

const editMessage = catchAsync(async (req, res) => {
  const message = await messageService.editMessage(req.user, req.params.messageId, req.body);
  res.send(messageSerializer.messageItem(message));
});

const deleteMessage = catchAsync(async (req, res) => {
  await messageService.deleteMessage(req.user, req.params.messageId);
  res.status(httpStatus.NO_CONTENT).send();
});

export default { listMessages, sendMessage, editMessage, deleteMessage };
