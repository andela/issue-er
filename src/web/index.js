const micro = require('micro')

const config = require('../config')
const app = require('./app')

const { port } = config.server

const server = micro(app)

server.listen(port || 3000)
