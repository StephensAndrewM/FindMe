var GAME = {
	localPlayer: null,
	localJoined: false,
	started: false,
	players: [],
	grid: [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
	current: null
};

$(function() {

	var socket = io();

	// Server sends data about its state upon connection
	socket.on('connect ACK', function(data) {
		console.log(data);

		if (data.started) {
			// Don't let player join if server already has a game in progress
			console.log('ERR: Game Already Started');
		}

		updatePlayerList(data.players);

	})

	// Join game when player presses button
	$('#joinGameButton').click(function() {

		// Fake a real disabled attribute
		if ($(this).hasClass('disabled')) { return; }

		var name = $('#playerInput').val();
		if (name != '') {
			console.log('Attempting to join game');
			socket.emit('join', { name: name });
			GAME.localPlayer = name;
			$('#joinGameButton').toggleClass('disabled', true);
		}

		return false;

	})

	// Player receives acknowledgement from server after attempting to join
	socket.on('join ACK', function(data) {

		// Ignore message if player never tried to join or if game in progress
		if (GAME.localPlayer == null) { return; }
		if (GAME.started) { return; }

		// Hide button if successful join
		if (data.success) {
			console.log('Player successfully joined game');
			GAME.localJoined = true;

		// TODO Better error handling
		} else {
			console.log('ERR: ', data.message);
			GAME.localPlayer = null;
			GAME.localJoined = false;
			$('#joinGameButton').toggleClass('disabled', false);
		}

	})

	// A player has joined the game somewhere else
	socket.on('join', function(data) {

		// Ignore if game currently in progress
		if (GAME.started) { return; }

		updatePlayerList(data.players);

	})

});

var updatePlayerList = function(players) {

	console.log('Updating player list ', players);

	GAME.players = players;

	// Truncate Players List, then Recreate List
	$('#players ul').html('')
	players.map(function(name) {
		var playerItem = $('<li></li>').text(name);
		$('#players ul').append(playerItem);
	})

	// Only allow starting game if player has joined and 2 or more players
	$('#startGameButton').toggleClass('disabled', !(players.length > 1 && GAME.localJoined));
	$('#noPlayersMsg').toggle(players.length < 1);
	
}