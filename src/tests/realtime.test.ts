import { CosmosClient } from '@azure/cosmos';
import { WebSocketServer } from 'ws';
import { ChangeFeedProcessor } from '../services/changeFeed.service.js';
import dotenv from 'dotenv';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import util from 'util';

dotenv.config();

const execPromise = util.promisify(exec);

async function killProcessOnPort(port: number) {
    try {
        // For macOS and Linux
        const { stdout } = await execPromise(`lsof -i :${port} -t`);
        if (stdout) {
            const pid = stdout.trim();
            await execPromise(`kill -9 ${pid}`);
            console.log(`Killed process ${pid} on port ${port}`);
        }
    } catch (error) {
        // If no process found, that's fine
        console.log(`No process found on port ${port}`);
    }
}

async function findAvailablePort(startPort: number): Promise<number> {
    const ports = [startPort, 8081, 8082, 8083, 8084, 8085];
    
    for (const port of ports) {
        try {
            await killProcessOnPort(port);
            
            // Try to create a test server
            const testServer = http.createServer();
            
            await new Promise<void>((resolve, reject) => {
                testServer.listen(port, () => {
                    testServer.close(() => resolve());
                });
                
                testServer.on('error', (error: any) => {
                    if (error.code === 'EADDRINUSE') {
                        console.log(`Port ${port} is in use, trying next port...`);
                        reject(error);
                    } else {
                        reject(error);
                    }
                });
            });
            
            console.log(`Found available port: ${port}`);
            return port;
        } catch (error) {
            console.log(`Port ${port} is not available`);
            continue;
        }
    }
    
    throw new Error('No available ports found');
}

async function testRealtimeUpdates() {
    try {
        const app = express();
        app.use(cors());
        const server = http.createServer(app);
        
        // Find an available port
        const PORT = await findAvailablePort(8080);
        console.log(`Starting server on port ${PORT}`);
        
        await new Promise<void>((resolve, reject) => {
            server.listen(PORT, () => {
                console.log(`Server running on port ${PORT}`);
                console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
                resolve();
            });
            
            server.on('error', (error: any) => {
                console.error('Server error:', error);
                reject(error);
            });
        });

        const wss = new WebSocketServer({ 
            server,
            path: '/ws',
            clientTracking: true,
            perMessageDeflate: false
        });
        
        wss.on('error', (error) => {
            console.error('WebSocket Server Error:', error);
        });

        wss.on('connection', (ws, req) => {
            console.log(`New connection from ${req.socket.remoteAddress}`);
            
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    if (data.type === 'subscribe') {
                        console.log(`User ${data.userId} subscribed`);
                        ws.send(JSON.stringify({ type: 'subscribed', userId: data.userId }));
                    }
                } catch (error) {
                    console.error('Message parsing error:', error);
                }
            });

            ws.send(JSON.stringify({ type: 'connected' }));
        });

        const client = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT!,
            key: process.env.COSMOS_DB_KEY!
        });

        const changeFeedProcessor = new ChangeFeedProcessor(client, wss);
        await changeFeedProcessor.init();

        // Keep the process running
        process.on('SIGINT', () => {
            console.log('Shutting down...');
            wss.close(() => {
                console.log('WebSocket server closed');
                server.close(() => {
                    console.log('HTTP server closed');
                    process.exit(0);
                });
            });
        });

    } catch (error) {
        console.error('Test setup failed:', error);
        process.exit(1);
    }
}

// Run the test
testRealtimeUpdates().catch(console.error); 