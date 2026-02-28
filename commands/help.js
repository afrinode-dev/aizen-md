const menu = require('./menu.js');

module.exports = {
    name: 'help',
    description: 'Alias de la commande menu',
    
    async execute(sock, m, args, from, context) {
        return menu.execute(sock, m, args, from, context);
    }
};