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

	// Hide Flashpad on initial load
	$('#flashpad').hide();

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
		if ($(this).hasClass('disabled')) { return false; }

		var name = $('#playerInput').val();
		if (name != '') {
			console.log('Attempting to join game');
			socket.emit('join', { name: name });
			GAME.localPlayer = name;
			$('#joinGameButton').toggleClass('disabled', true);
		}

		return false;

	})

	// In case the form submits, do the same thing as button press
	$('#joinGameButton form').submit(function() {
		$('#joinGameButton').click();
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

	$('#startGameButton').click(function() {

		// Fake a real disabled attribute
		if ($(this).hasClass('disabled')) { return false; }

		// Notify server, then server responds with official start
		socket.emit('start', {});

		return false;

	})

	// Server notifies that game is definitely starting
	socket.on('start', function(data) {

		var timeToStart = 3;
		var countdown = function() {
			$('#startGameButton').text("Game Starts In "+timeToStart+"...");
			timeToStart--;

			if (timeToStart == -1) {
				$('#welcome').hide(250);
				$('#flashpad').show(250);
				clearTimeout(t);
			}

		}
		countdown(); // Call it once on click, then repeatedly 
		var t = window.setInterval(countdown, 1000);

		turnEvent(data);
		
	});

	// In-game event, sent from elsewhere
	socket.on('press', function(data) {

		turnEvent(data);	

	})

	// In-game event, local
	$('#flashpad a.tile').click(function() {

		if (GAME.current != GAME.localPlayer) { return false; }
		if ($(this).hasClass('pressed')) { return false; }

		console.log('press', $(this).data('x'), $(this).data('y'))

		socket.emit('press', {
			x: $(this).data('x'),
			y: $(this).data('y'),
			player: GAME.localPlayer
		})

	});

});

var updatePlayerList = function(players) {

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

var turnEvent = function(data) {

	renderGrid(data.grid);
	GAME.current = data.current;

	if (data.current == GAME.localPlayer) {
		$('#turn').text("Your turn, "+data.current+"!").removeClass('highlight');
	} else {
		$('#turn').text("Waiting for "+data.current+"...").addClass('highlight');
	}

}

var renderGrid = function(newGrid) {

	GAME.grid = newGrid;

	for (var y = 0; y < 3; y++) {
		for (var x = 0; x < 3; x++) {
			$('#flashpad a').eq((y*4)+x).toggleClass('pressed', GAME.grid[y][x]).data({ 'x': x, 'y': y});
		}
	}

}