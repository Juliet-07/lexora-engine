import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

// The platform's first — and so far only — real-time push channel.
// Nothing like this existed anywhere in lexora-engine before (every
// "live" update elsewhere is REST polling + email); this exists
// specifically so the board portal's Notifications and Directory
// messaging features are genuinely real-time rather than another
// 60-second poll, per the PO's explicit "Notifications feature should
// be made functional and real time" (Oct 2026).
//
// Deliberately generic — a single namespace, one room per signed-in
// user (`user:<userId>`), and one `emitToUser` method — rather than
// a messaging-specific gateway and a separate notifications-specific
// gateway. Both BoardMessagingService and BoardNotificationService
// inject this same class and push through it; a future feature
// needing a live push (tenant-side notifications, say) can reuse it
// too without any board-specific assumption baked in here.
//
// Auth mirrors the REST API's own JwtStrategy exactly: the same
// bearer token the browser already holds from login is handed to the
// socket at connect time (Socket.IO's `auth` handshake option, with a
// query-string fallback for any client that can't set `auth`), and is
// verified with the same jwt.secret. A connection with a missing or
// invalid token is dropped immediately — nothing here is reachable
// without already being signed in.
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/realtime',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) throw new Error('No token presented');
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });
      const userId = payload?.sub;
      if (!userId) throw new Error('Token has no subject');
      client.data.userId = userId;
      await client.join(this.roomFor(userId));
    } catch (err) {
      this.logger.warn(
        `Realtime connection rejected: ${(err as Error)?.message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {
    // Socket.IO already removes the socket from every room on
    // disconnect — nothing additional to clean up here.
  }

  // Pushes one event to every tab/device a signed-in user currently
  // has open. A no-op (not an error) when nobody is connected —
  // callers never need to check first, the same way an email send
  // doesn't need to check whether the recipient's inbox is open.
  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(this.roomFor(userId)).emit(event, payload);
  }

  private roomFor(userId: string): string {
    return `user:${userId}`;
  }

  private extractToken(client: Socket): string | null {
    const authToken = (client.handshake.auth as Record<string, unknown>)?.token;
    if (typeof authToken === 'string' && authToken) return authToken;

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }

    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken) return queryToken;

    return null;
  }
}
