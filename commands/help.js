import menu from './menu.js';

export default {
    name: 'help',
    description: 'Alias de la commande menu',
    
    async execute(sock, m, args, from, context) {
        return menu.execute(sock, m, args, from, context);
    }
};