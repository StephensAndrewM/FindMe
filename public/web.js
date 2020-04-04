// Constants
var TileState = {
	UNPRESSED: 0,
	PRESSED: 1,
	WINNING: 2,
};

var STANDARD_TIMEOUT = 10;
var WIN_DISPLAY_TIMEOUT = 5;
var PLAYER_STORAGE_KEY = 'playerName'

var ClientMessages = {
	JOIN: "join",
	START: "start",
	PRESS: "press",
	EXIT: "exit",
	CONNECTION: "connection",
	DISCONNECT: "disconnect"
};

var ServerMessages = {
	CONNECT_RESULT: "ConnectResult",
	JOIN_RESULT : "JoinResult",
	PLAYER_LIST_UPDATE: "PlayerListUpdate",
	GAME_START: "GameStart",
	TILE_PRESS: "TilePress",
	VICTORY: "Victory",
	GAME_RESET: "GameReset"
};

// These get preloaded in init()
var EventSounds = {
	START: null,
	PRESS: null,
	WIN: null
}

var DisplayState = {
	TITLE_SCREEN: 'stateTitleScreen',
	IN_GAME: 'stateInGame',
	NAME_PROMPT: 'stateNamePrompt',
	WIN: 'stateWin',
	WIN_WITH_PROMPT: 'stateWinWithPrompt',
}

// This uses a distinct namespace from TileState since there's no 
//     functionality attached to these display modes.
var WELCOME_SCREEN_BOARD_COLOR = [
	[1,0,0,1],
	[1,0,0,1],
	[1,0,0,1],
	[1,0,0,1]];
var GAME_START_BOARD_COLOR = [
	[1,0,0,1],
	[3,0,0,1],
	[1,0,0,1],
	[1,0,0,1]];

var TileColor = {
	GRAY: 0,
	RED: 1,
	GREEN: 2,
	RED_FLASH: 3,
	GREEN_FLASH: 4,
}


// State shared between client and server
var GlobalGameState = {
	GameInProgress: false,
	Players: [],
	Board: null,
	CurrentId: -1,
	WinningTile: null,
	WinsByUsername: {}
}

function getDefaultPrivateLocalState() {
	return {
		PlayerName: null,
		IsPlayerActive: false,
		DisplayState: DisplayState.TITLE_SCREEN,
		GameStartTileFlash: false,
		GameWinTileFlash: false,
		ErrorMessage: null,
		CountdownSeconds: -1,
		CountdownInterval: null,
		WinPromptTimeout: null,
	};
}
var PrivateLocalState = getDefaultPrivateLocalState();
// Have core elements been loaded?
var PageLoaded = false;

var BasePrivateLocalState = null;

$(function() {

	var socket = io();

	init();

	// Server sends data about its state upon connection
	socket.on(ServerMessages.CONNECT_RESULT, function(data) {
		// In case we lost connection to server, reset local state to default
		PrivateLocalState = getDefaultPrivateLocalState();

		updateGlobalGameState(data);
	})

	// Player is on title screen, wants to join in the fun
	$('#joinGameButton').click(function() {
		PrivateLocalState.DisplayState = DisplayState.NAME_PROMPT;
		render();
		$('#playerInput').focus();		
		return false;
	})

	// Report name and officially join game when player presses button
	$('#setNameButton').click(function() {
		var name = $('#playerInput').val();
		if (name != '') {
			console.log('Attempting to join game');
			socket.emit(ClientMessages.JOIN, { 
				name: name
			});
		}

		return false;
	})

	// In case the form submits, do the same thing as button press
	$('#joinGameForm').submit(function() {
		$('#joinGameButton').click();
		return false;
	})

	// Player receives acknowledgement from server after attempting to join
	socket.on(ServerMessages.JOIN_RESULT, function(data) {
		PrivateLocalState.DisplayState = DisplayState.TITLE_SCREEN;
		
		if (data.success) {
			console.log('Player successfully joined game');

			PrivateLocalState.PlayerName = data.name;
			PrivateLocalState.IsPlayerActive = true;
			PrivateLocalState.ErrorMessage = null;
			
			// Save the name after server has confirmed success
			localStorage.setItem(PLAYER_STORAGE_KEY, data.name)			
		} else {
			console.log('ERR: ', data.message);

			displayTemporaryErrorMessage(data.message);
		}

		updateGlobalGameState(data);
	})

	// A player has joined the game somewhere else
	socket.on(ServerMessages.PLAYER_LIST_UPDATE, function(data) {
		updateGlobalGameState(data);
	})

	// A player pressed the exit button on title screen
	$('#unjoinGameButton').click(function() {
		console.log("Attempting to disconnect on title screen");
		leaveGame(socket);
		// Need to re-render manually here since server does not trigger an event
		render();
		return false;
	});

	// Respond to player intent to start the game
	$('#startGameButton').click(function() {
		// Disabled attribute could be set if not enough players
		if ($(this).hasClass('disabled')) { return false; }

		// Notify server, then server responds with official start
		socket.emit(ClientMessages.START, {});

		return false;
	});

	// Server notifies that game is definitely starting
	socket.on(ServerMessages.GAME_START, function(data) {
		PrivateLocalState.GameStartTileFlash = true;
		window.setTimeout(function() {
			PrivateLocalState.GameStartTileFlash = false;
			render();
		}, 2000);
		playSound(EventSounds.START);

		if (PrivateLocalState.PlayerName != null) {
			PrivateLocalState.DisplayState = DisplayState.IN_GAME;
		}

		// Clear state from win screen, just in case
		clearTimeout(PrivateLocalState.WinPromptTimeout)
		PrivateLocalState.GameWinTileFlash = false;

		updateGlobalGameState(data);
	});

	// In-game event, sent from anywhere (local or remote player)
	socket.on(ServerMessages.TILE_PRESS, function(data) {
		updateGlobalGameState(data);
		playSound(EventSounds.PRESS);
	})

	// In-game event, the local user has pressed a tile
	$('#flashpad a.tile').click(function() {
		// Don't allow interaction during animations
		if (PrivateLocalState.GameStartTileFlash || PrivateLocalState.GameWinTileFlash) {
			return false;
		}

		// Ignore presses when not local player's turn
		var currentPlayerName = GlobalGameState.Players[GlobalGameState.CurrentId];
		if (currentPlayerName != PrivateLocalState.PlayerName) { 
			console.log('It is not your turn!', currentPlayerName, PrivateLocalState.PlayerName);
			return false;
		}
		var pressX = $(this).data('x');
		var pressY = $(this).data('y');

		if (GlobalGameState.Board[pressY, pressX] != TileState.UNPRESSED) {
			console.log("This tile is already pressed.", pressX, pressY);
		}

		console.log('Tile Press', pressX, pressY);

		socket.emit(ClientMessages.PRESS, {
			x: pressX,
			y: pressY
		});

		return false;
	});

	socket.on(ServerMessages.VICTORY, function(data) {
		PrivateLocalState.GameWinTileFlash = true;
		playSound(EventSounds.WIN);

		// Read the winner from incoming data in case it's different (last tile case)
		var winningPlayerName = data.state.Players[data.state.CurrentId];
		var localPlayerWon = winningPlayerName == PrivateLocalState.PlayerName;

		if (localPlayerWon) {
			PrivateLocalState.DisplayState = DisplayState.WIN_WITH_PROMPT;
			var name=$('<span></span>').text(winningPlayerName);
			$('.winScreenMessage').html("YOU WIN,<br />").append(name).append("!");
		} else {
			PrivateLocalState.DisplayState = DisplayState.WIN;
			var name=$('<span></span>').text(winningPlayerName);
			$('.winScreenMessage').html(name).append("<br />Wins!");
		}
		
		// Switch away from win prompt after a timeout
		PrivateLocalState.WinPromptTimeout = window.setTimeout(function() {
			PrivateLocalState.GameWinTileFlash = false;
			PrivateLocalState.DisplayState = DisplayState.TITLE_SCREEN;
			if (localPlayerWon) {
				leaveGame(socket);
			}
			render();
		}, WIN_DISPLAY_TIMEOUT * 1000);

		updateGlobalGameState(data);
	})

	$('#postWinOptInButton').click(function() {
		clearTimeout(PrivateLocalState.WinPromptTimeout);

		PrivateLocalState.GameWinTileFlash = false;
		PrivateLocalState.DisplayState = DisplayState.TITLE_SCREEN;
		render();

		return false;
	})

	$('#postWinOptOutButton').click(function() {
		clearTimeout(PrivateLocalState.WinPromptTimeout);
		
		PrivateLocalState.GameWinTileFlash = false;
		PrivateLocalState.DisplayState = DisplayState.TITLE_SCREEN;
		leaveGame(socket);
		render();

		return false;
	})

	// A player disconnected or timed out (could be local)
	socket.on(ServerMessages.GAME_RESET, function(data) {
		PrivateLocalState.DisplayState = DisplayState.TITLE_SCREEN;
		displayTemporaryErrorMessage(data.message);
		updateGlobalGameState(data);
	})

	// A player pressed the disconnect button mid-game
	$('#exitGameButton').click(function() {
		console.log("Attempting mid-game disconnect");
		leaveGame(socket);
		render();
		return false;
	});

	// On load-populate the username from localStorage if possible
	if (localStorage.getItem(PLAYER_STORAGE_KEY) !== null) {
		$('#playerInput').val(localStorage.getItem(PLAYER_STORAGE_KEY));
	}

});

var renderPlayerList = function() {

	// Truncate existing players list then replace with current list
	$('ul#playersList').html('');
	GlobalGameState.Players.map(function(name) {
		var playerItem = $('<li></li>').text(name);
		$('ul#playersList').append(playerItem);
	})
	// Hide the list if there's nothing to display
	$('ul#playersList').toggle(GlobalGameState.Players.length > 0);
	// Show the empty list message if there are no players
	$('#noPlayersMsg').toggle(GlobalGameState.Players.length == 0);

	// Get list of winners, sorted by number of wins
	var winners = Object.keys(GlobalGameState.WinsByUsername).sort(function(a,b) {
		return GlobalGameState.WinsByUsername[b] - GlobalGameState.WinsByUsername[a]
	});
	// Hide the title if there's nothing to display
	$('#winnersListTitle').toggle(winners.length > 0);
	// Truncate existing winners list then replace with current list
	$('ul#winnersList').html('')
	winners.map(function(name) {
		var winnerItem = $('<li></li>').text(name);
		var winCount = $('<span></span>').text(GlobalGameState.WinsByUsername[name]);
		winnerItem.append(winCount);
		$('ul#winnersList').append(winnerItem);
	})

	// Only allow starting game if server is ready and player has joined
	$('#startGameButton').toggleClass('disabled', 
		(GlobalGameState.CanStartNewGame == false || PrivateLocalState.PlayerName == null));

	if (PrivateLocalState.ErrorMessage != null) {
		$('.errorMessage').text(PrivateLocalState.ErrorMessage);
	} else {
		$('.errorMessage').text("");
	}
	
}

var renderGrid = function() {
	// Don't display current player or update grid if game starting, ending, or not in progress
	if (PrivateLocalState.GameWinTileFlash) {
		renderGridPostGame();
	} else if (PrivateLocalState.GameStartTileFlash 
		|| !GlobalGameState.GameInProgress) { 
		renderGridNotInGame();
	} else {
		renderGridInGame();
	}
}

var renderGridPostGame = function() {
	for (var y = 0; y < 4; y++) {
		for (var x = 0; x < 4; x++) {
			var tile = $('#flashpad a').eq((y*4)+x);
			tile.removeClass('red');
			tile.removeClass('green');
			tile.removeClass('red-flash');
			tile.removeClass('green-flash');
			if (GlobalGameState.WinningTile.y == y && GlobalGameState.WinningTile.x == x) {
				tile.addClass('green-flash');
			}
		}
	}
	renderCountdown();
	$('#turn').text("");
}

var renderGridNotInGame = function() {
	// Otherwise, display according to a pre-set pattern
	var layout = PrivateLocalState.GameStartTileFlash ? 
		GAME_START_BOARD_COLOR : WELCOME_SCREEN_BOARD_COLOR;

	for (var y = 0; y < 4; y++) {
		for (var x = 0; x < 4; x++) {
			var tile = $('#flashpad a').eq((y*4)+x);
			tile.toggleClass('red', layout[y][x] == TileColor.RED);
			tile.toggleClass('green', layout[y][x] == TileColor.GREEN);
			tile.toggleClass('red-flash', layout[y][x] == TileColor.RED_FLASH);
			tile.toggleClass('green-flash', layout[y][x] == TileColor.GREEN_FLASH);
		}
	}

	renderCountdown();
	$('#turn').text("");
}

var renderGridInGame = function() {
	for (var y = 0; y < 4; y++) {
		for (var x = 0; x < 4; x++) {
			var tile = $('#flashpad a').eq((y*4)+x);
			tile.toggleClass('red', GlobalGameState.Board[y][x] == TileState.UNPRESSED);
			tile.toggleClass('green', GlobalGameState.Board[y][x] == TileState.PRESSED);
			tile.removeClass('red-flash');	// Never used to represent tile state
			tile.toggleClass('green-flash', GlobalGameState.Board[y][x] == TileState.WINNING);
		}
	}

	var currentPlayerName = GlobalGameState.Players[GlobalGameState.CurrentId];
	if (currentPlayerName == PrivateLocalState.PlayerName) {
		$('#turn').text("Your turn, " + currentPlayerName + "!").addClass('highlight');
	} else {
		$('#turn').text("Waiting for " + currentPlayerName + "...").removeClass('highlight');
	}

	renderCountdown();
}

var renderCountdown = function() {
	var display = GlobalGameState.GameInProgress 
		&& PrivateLocalState.IsPlayerActive
		&& !PrivateLocalState.GameStartTileFlash;

	$('#countdown').toggleClass('isCountingDown', display);
	if (PrivateLocalState.CountdownInterval != null) {
		clearTimeout(PrivateLocalState.CountdownInterval);
	}
	if (display) {
		PrivateLocalState.CountdownSeconds = 10;
		var updateCountdownNumber = function() {
			PrivateLocalState.CountdownSeconds--;
			if (PrivateLocalState.CountdownSeconds < 0) {
				// Don't display negative number, just in case
				$('#countdown-number').text(0);	
			} else {
				$('#countdown-number').text(PrivateLocalState.CountdownSeconds);
			}
			$('#countdown').toggleClass('isTimeCritical', PrivateLocalState.CountdownSeconds <= 2);
		}
		PrivateLocalState.CountdownInterval = setInterval(updateCountdownNumber, 1000);
		document.getElementById('countdown-animation').beginElement();
		updateCountdownNumber();
	}
}

var displayTemporaryErrorMessage = function(msg) {
	PrivateLocalState.ErrorMessage = msg;
	// If it's the same message, clear it
	window.setTimeout(function() {
		if (PrivateLocalState.ErrorMessage == msg) {
			PrivateLocalState.ErrorMessage = null;
			render();
		}
	}, 5000);
}

var leaveGame = function(socket) {
	PrivateLocalState.PlayerName = null;
	PrivateLocalState.IsPlayerActive = false;
	socket.emit(ClientMessages.EXIT, {});
}

var init = function() {

	// Load images and build the grid
	loadedImages = 0;
	for (var y = 0; y < 4; y++) {
		for (var x = 0; x < 4; x++) {
			var img = new Image();
			var src = "images/tile" + x + y + ".png"
			img.src = src;
			img.onload = function() {
				loadedImages++;
				if (loadedImages < 16) { return; }
				PageLoaded = true;
				render();
			}

			var tile = $('<a href="#" class="tile"></a>');
			tile.data({ 'x': x, 'y': y});
			var tileImg = $('<img />');
			tileImg.attr('src', src);
			tile.append(tileImg);
			$('#flashpad').append(tile);
		}
	}

	// Preload sound files
	EventSounds.PRESS = new Audio("/sound/press.mp3");
	EventSounds.START = new Audio("/sound/start.mp3");
	EventSounds.WIN = new Audio("/sound/win.mp3");

}

var updateGlobalGameState = function(data) {
	console.log("Updating Game State", data);
	GlobalGameState = data.state;
	render();
}

var render = function() {
	$('body').removeClass();
	if (PageLoaded) { 
		$('body').addClass('pageLoaded');
	}
	$('body').addClass(PrivateLocalState.DisplayState);
	if (PrivateLocalState.IsPlayerActive) {
		$('body').addClass('activePlayer');
	} else {
		$('body').addClass('inactivePlayer');
	}
	if (GlobalGameState.GameInProgress) {
		$('body').addClass('gameInProgress');
	} else {
		$('body').addClass('noGameInProgress');
	}

	renderPlayerList();
	renderGrid();
}

var playSound = function(soundObj) {
	if (isDebug()) { return; } 		// Save Andrew's sanity during dev work

	// If not HAVE_ENOUGH_DATA don't try to play
	if (soundObj.readyState < 4) { return; }
	soundObj.currentTime = 0;
	soundObj.play();
}

var isDebug = function() {
	return (window.location.href.indexOf("localhost") > -1);
}