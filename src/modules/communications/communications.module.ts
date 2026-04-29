import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { Message, MessageSchema, Notification, NotificationSchema } from './schemas/communication.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [CommunicationsController],
  providers: [CommunicationsService],
  exports: [CommunicationsService, MongooseModule],
})
export class CommunicationsModule {}
