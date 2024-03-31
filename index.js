const server = require("./server.js")
const minimist = require('minimist')
const log = require('loglevel')

const args = minimist(process.argv.slice(2), {
	default: {
		deterministic: false,
		logLevel: "info",
		port: 3000,
	}
})

log.setLevel(args.logLevel);

// Start the heart of the server
server.run(args.deterministic, args.port);
