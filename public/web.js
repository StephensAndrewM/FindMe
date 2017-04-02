var UNPRESSED_TILE = 0;
var PRESSED_TILE = 1;
var WINNING_TILE = 2;

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

	renderStartScreen(true /* immediateHideFlashpad */);

	// Server sends data about its state upon connection
	socket.on('connect ACK', function(data) {
		console.log(data);

		if (data.started) {
			// Don't let player join if server already has a game in progress
			console.log('ERR: Game Already Started');
			// TODO Display an error to the player
		}
		
		GAME.players = data.players;
		renderPlayerList();

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

		
		if (data.success) {
			// Hide button if successful join
			console.log('Player successfully joined game');
			GAME.localJoined = true;

		} else {
			// Not really sure what errors would happen here
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

		GAME.players = data.players;
		renderPlayerList();

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
				renderFlashpad();
				clearTimeout(t);
			}

		}
		countdown(); // Call it once on click, then repeatedly 
		var t = window.setInterval(countdown, 1000);

		turnEvent(data);
		
	});

	// In-game event, sent from elsewhere (or current client)
	socket.on('press', function(data) {
		turnEvent(data);
	})

	// In-game event, local
	$('#flashpad a.tile').click(function() {

		if (GAME.current != GAME.localPlayer) { 
			console.log('It is not your turn!', GAME.current, GAME.localPlayer);
			return false;
		}
		if ($(this).hasClass('pressed')) { 
			console.log('This button has already been pressed.');
			return false;
		}

		console.log('press', $(this).data('x'), $(this).data('y'))

		socket.emit('press', {
			x: $(this).data('x'),
			y: $(this).data('y'),
			player: GAME.localPlayer
		})

		return false;

	});

	socket.on('victory', function(data) {
		renderGrid(data.grid);
		GAME.current = null;

		$('#newGameButton').show(250);

		if (data.winner == GAME.localPlayer) {
			$('#turn').text("You win, " + data.winner + "!").removeClass('highlight');
		} else {
			$('#turn').text(data.winner + " wins Find Me!").addClass('highlight');
		}

	})

	$('#newGameButton').click(function() {
		// TODO handle start game condition same as regular start
		renderStartScreen();
	})

	// This refers to in-game disconnects only
	socket.on('disconnect', function(data) {

		if (GAME.started) {
			// If game is running, must stop the game
			GAME.current = null;
			GAME.started = false;
			GAME.players = data.players;
			$('#turn').text(data.lostPlayer+" has disconnected! :(").removeClass('highlight');
			$('#newGameButton').show(250);
		} else {
			// This is only a disconnection on title screen, nothing serious
			GAME.players = data.players;
			renderPlayerList();
		}

	})

});

var renderPlayerList = function() {

	// Truncate Players List, then Recreate List
	$('#players ul').html('');
	GAME.players.map(function(name) {
		var playerItem = $('<li></li>').text(name);
		$('#players ul').append(playerItem);
	})

	// Only allow starting game if player has joined and 2 or more players
	$('#startGameButton').toggleClass('disabled', !(GAME.players.length > 1 && GAME.localJoined));
	$('#noPlayersMsg').toggle(GAME.players.length < 1);
	
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

var renderStartScreen = function(immediateHideFlashpad) {

	$('#welcome').show(250);
	$('#flashpad').hide(immediateHideFlashpad ? null : 250);
	$('#startGameButton').text("Start Game");

}

var renderFlashpad = function() {

	$('#welcome').hide(250);
	$('#flashpad').show(250);
	$('#newGameButton').hide();

}

var renderGrid = function(newGrid) {

	GAME.grid = newGrid;

	for (var y = 0; y < 4; y++) {
		for (var x = 0; x < 4; x++) {
			var tile = $('#flashpad a').eq((y*4)+x);
			tile.data({ 'x': x, 'y': y});
			tile.toggleClass('pressed', GAME.grid[y][x] == PRESSED_TILE);
			tile.toggleClass('winning', GAME.grid[y][x] == WINNING_TILE);
		}
	}

}