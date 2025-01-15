import { WebSocketServer } from 'ws';
import { Server } from 'http';

export function setupWebSocketServer(server: Server) {
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        ws.on('message', (message) => {
            // Handle incoming messages (like subscriptions)
            const data = JSON.parse(message.toString());
            
            if (data.type === 'subscribe') {
                // Handle subscription
                ws.userId = data.userId;
            }
        });
    });

    return wss;
} 