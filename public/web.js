// Constants
var TILE_STATE = {
	UNPRESSED: 0,
	PRESSED: 1,
	WINNING: 2
};

var STANDARD_TIMEOUT = 10;

var CLIENT_MESSAGES = {
	JOIN: "join",
	START: "start",
	PRESS: "press",
	CONNECTION: "connection",
	DISCONNECT: "disconnect"
};

var SERVER_MESSAGES = {
	CONNECT_RESULT: "ConnectResult",
	JOIN_RESULT : "JoinResult",
	PLAYER_LIST_UPDATE: "PlayerListUpdate",
	GAME_START: "GameStart",
	TILE_PRESS: "TilePress",
	VICTORY: "Victory",
	GAME_RESET: "GameReset"
};


// State shared between client and server
var GlobalGameState = {
	GameInProgress: false,
	Players: [],
	Board: null,
	CurrentId: -1,
}

var PrivateLocalState = {
	PlayerName: null
}

$(function() {

	var socket = io();

	renderStartScreen(true /* immediateHideFlashpad */);

	// Server sends data about its state upon connection
	socket.on(SERVER_MESSAGES.CONNECT_RESULT, function(data) {
		updateGlobalGameState(data);

		if (GlobalGameState.GameInProgress) {
			// Don't let player join if server already has a game in progress
			console.log('ERR: Game Already Started');
			// TODO Display an error to the player
		}

		renderPlayerList();

	})

	// Join game when player presses button
	$('#joinGameButton').click(function() {

		// Fake a real disabled attribute
		if ($(this).hasClass('disabled')) { return false; }

		var name = $('#playerInput').val();
		if (name != '') {
			console.log('Attempting to join game');
			socket.emit(CLIENT_MESSAGES.JOIN, { 
				name: name
			});
			// Disable button -- will be re-enabled if problem joining
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
	socket.on(SERVER_MESSAGES.JOIN_RESULT, function(data) {
		updateGlobalGameState(data);
		
		if (data.success) {
			console.log('Player successfully joined game');

			// Save the name after server has confirmed success
			PrivateLocalState.PlayerName = data.name;
			renderPlayerList();

		} else {
			// TODO Display an error to the player
			console.log('ERR: ', data.message);
			$('#joinGameButton').toggleClass('disabled', false);
		}

	})

	// A player has joined the game somewhere else
	socket.on(SERVER_MESSAGES.PLAYER_LIST_UPDATE, function(data) {
		updateGlobalGameState(data);
		// In case we are displaying post-game state, this will switch screens and hide player list
		renderStartScreen(false /* immediatelyHideFlashpad */);
	})

	var startGameEventHandler = function() {

		// Fake a real disabled attribute
		if ($(this).hasClass('disabled')) { return false; }

		// Notify server, then server responds with official start
		socket.emit(CLIENT_MESSAGES.START, {});

		return false;

	}

	$('#startGameButton').click(startGameEventHandler);

	// Server notifies that game is definitely starting
	socket.on(SERVER_MESSAGES.GAME_START, function(data) {
		updateGlobalGameState(data);

		var timeToStart = 3;
		var countdown = function() {
			var countdownText = "Game Starts In " + timeToStart + "...";
			$('#startGameButton').text(countdownText);
			$('#newGameButton').text(countdownText);
			timeToStart--;

			if (timeToStart == -1) {
				renderFlashpad();
				clearTimeout(t);
			}

		}
		countdown(); // Call it once on click, then repeatedly 
		var t = window.setInterval(countdown, 1000);
	});

	// In-game event, sent from anywhere (local or remote player)
	socket.on(SERVER_MESSAGES.TILE_PRESS, function(data) {
		updateGlobalGameState(data);
		renderGrid();
	})

	// In-game event, the local user has pressed a tile
	$('#flashpad a.tile').click(function() {

		// Ignore presses when not local player's turn
		var currentPlayerName = GlobalGameState.Players[GlobalGameState.CurrentId];
		if (currentPlayerName != PrivateLocalState.PlayerName) { 
			console.log('It is not your turn!', currentPlayerName, PrivateLocalState.PlayerName);
			return false;
		}
		var pressX = $(this).data('x');
		var pressY = $(this).data('y');

		if (GlobalGameState.Board[pressY, pressX] != TILE_STATE.UNPRESSED) {
			console.log("This tile is already pressed.", pressX, pressY);
		}

		console.log('Tile Press', pressX, pressY);

		socket.emit(CLIENT_MESSAGES.PRESS, {
			x: pressX,
			y: pressY
		});

		return false;

	});

	socket.on(SERVER_MESSAGES.VICTORY, function(data) {
		updateGlobalGameState(data);
		renderGrid();

		$('#newGameButton').show(250);

		var winningPlayerName = GlobalGameState.Players[GlobalGameState.CurrentId];
		if (winningPlayerName == PrivateLocalState.PlayerName) {
			$('#turn').text("You win, " + winningPlayerName + "!").addClass('highlight');
		} else {
			$('#turn').text(winningPlayerName + " wins Find Me!").removeClass('highlight');
		}

	})

	$('#newGameButton').click(startGameEventHandler);

	// A player disconnected or timed out
	socket.on(SERVER_MESSAGES.GAME_RESET, function(data) {

		var gameWasInProgress = GlobalGameState.GameInProgress;
		updateGlobalGameState(data);

		if (gameWasInProgress) {
			// If game is running, must stop game and return to title screen
			renderStartScreen(false /* immediatelyHideFlashpad */);
		} else {
			// This is only a disconnection on title screen, nothing serious
			renderPlayerList();
		}

	})

});

var renderPlayerList = function() {

	// Truncate Players List, then Recreate List
	$('#players ul').html('');
	GlobalGameState.Players.map(function(name) {
		var playerItem = $('<li></li>').text(name);
		$('#players ul').append(playerItem);
	})

	// Only allow starting game if player has joined and 2 or more players
	$('#startGameButton').toggleClass('disabled', 
		(GlobalGameState.Players.length <= 1 || PrivateLocalState.PlayerName == null));
	$('#noPlayersMsg').toggle(GlobalGameState.Players.length < 1);
	
}

var renderStartScreen = function(immediateHideFlashpad) {

	$('#welcome').show(250);
	$('#flashpad').hide(immediateHideFlashpad ? null : 250);
	$('#startGameButton').text("Start Game");
	renderPlayerList();

}

var renderFlashpad = function() {

	$('#welcome').hide(250);
	$('#flashpad').show(250);
	$('#newGameButton').hide();
	$('#newGameButton').text("Play Again!");
	renderGrid();

}

var renderGrid = function() {

	for (var y = 0; y < 4; y++) {
		for (var x = 0; x < 4; x++) {
			var tile = $('#flashpad a').eq((y*4)+x);
			tile.data({ 'x': x, 'y': y});
			tile.toggleClass('pressed', GlobalGameState.Board[y][x] == TILE_STATE.PRESSED);
			tile.toggleClass('winning', GlobalGameState.Board[y][x] == TILE_STATE.WINNING);
		}
	}

	var currentPlayerName = GlobalGameState.Players[GlobalGameState.CurrentId];
	if (currentPlayerName == PrivateLocalState.PlayerName) {
		$('#turn').text("Your turn, " + currentPlayerName + "!").addClass('highlight');
	} else {
		$('#turn').text("Waiting for " + currentPlayerName + "...").removeClass('highlight');
	}

}

var updateGlobalGameState = function(data) {
	console.log("Updating Game State", data);
	GlobalGameState = data.state;
}