export default {
    name: 'ping',
    description: 'Vérifie la latence du bot',
    
    async execute(sock, m, args, from, context) {
        const start = Date.now();
        
        await sock.sendMessage(from, { text: '🏓 Pong!' }, { quoted: m });
        
        const latency = Date.now() - start;
        
        await sock.sendMessage(from, { 
            text: `📡 Latence: ${latency}ms` 
        });
    }
};