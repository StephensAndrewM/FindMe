const chai = require("chai");
const chaiAsPromised = require('chai-as-promised');
const chaiArrays = require('chai-arrays');
const server = require("../server.js")

const {
	Builder,
	By,
	Key
} = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const options = new chrome.Options()
options.addArguments('--disable-dev-shm-usage')
options.addArguments('--no-sandbox')

// Configure Chai extensions, options, and aliases
chai.use(chaiAsPromised);
chai.use(chaiArrays);
chai.config.includeStack = true;
var expect = chai.expect;

describe("Find Me user journeys", function() {
	this.timeout(0);

	var app;
	var p1, p2;

	beforeEach(function() {
		app = server.run(/* deterministic= */ true);

		p1 = new Builder()
			.forBrowser('chrome')
			.setChromeOptions(options)
			.build();
		p2 = new Builder()
			.forBrowser('chrome')
			.setChromeOptions(options)
			.build();
	})

	afterEach(async function() {
		p1.quit();
		p2.quit();
		app.stop();

		// Pause briefly to avoid errors
		await new Promise(resolve => setTimeout(resolve, 1000));
	})

	it("allows players to join and play", async function() {
		await waitForPageLoad(p1)
		await waitForPageLoad(p2)

		// P1 joins the game
		await p1.findElement(By.id('joinGameButton')).click();
		await p1.sleep(1000)
		await p1.findElement(By.id('playerInput')).sendKeys("P1", Key.RETURN);
		await p1.sleep(1000)

		// Players list should be updated
		await expectPlayersList(p1, ['P1']);
		await expectPlayersList(p2, ['P1']);

		// Only P1 should see the option to start the game
		await expect(p1.findElement(By.id('startGameButton')).isDisplayed()).to.eventually.be.true;
		await expect(p2.findElement(By.id('startGameButton')).isDisplayed()).to.eventually.be.false;

		// P2 joins the game
		await p2.findElement(By.id('joinGameButton')).click();
		await p2.sleep(1000)
		await p2.findElement(By.id('playerInput')).sendKeys("P2");
		await p2.findElement(By.id('setNameButton')).click();
		await p2.sleep(1000)

		// Players list should be updated
		await expectPlayersList(p1, ['P1', 'P2']);
		await expectPlayersList(p2, ['P1', 'P2']);

		// P1 starts the game
		var button = p1.findElement(By.id('startGameButton'));
		await expect(button.isDisplayed()).to.eventually.be.true;
		await button.click();
		// Wait for game start animation to complete
		await p1.sleep(4000)

		// P1 should be able to press a tile and everyone should see
		await pressTile(p1, 2)
		await expect(isTilePressed(p1, 2)).to.eventually.be.true;
		await expect(isTilePressed(p2, 2)).to.eventually.be.true;

		// P1 should not be able to press another tile immediately
		await pressTile(p1, 3)
		await expect(isTilePressed(p1, 3)).to.eventually.be.false;

		// Now P2 should be able to press a tile (the winning one)
		await pressTile(p2, 1)

		// Each player should see the appropriate message
		await expect(p1.findElement(By.css('#winScreen')).isDisplayed()).to.eventually.be.true;
		await expect(p1.findElement(By.css('#winScreen .winScreenMessage')).getText()).to.eventually.equal("P2\nWINS!");
		await expect(p2.findElement(By.css('#winScreenWithPrompt')).isDisplayed()).to.eventually.be.true;
		await expect(p2.findElement(By.css('#winScreenWithPrompt .winScreenMessage')).getText()).to.eventually.equal("YOU WIN,\nP2!");

		// Wait for the post-game options to be displayed
		await p2.sleep(1000);

		// P2 should see the post-game options and opt into next game
		button = p2.findElement(By.id('postWinOptInButton'));
		await expect(button.isDisplayed()).to.eventually.be.true;
		await button.click();

		// Wait for game end animation to complete
		await p1.sleep(5000)

		// Winners list should be updated accordingly
		// Returned text should contain number of wins (last character)
		await expectWinnersList(p1, ['P21']);
		await expectWinnersList(p2, ['P21']);

		// Players list should be the same as before
		await expectPlayersList(p1, ['P1', 'P2']);
		await expectPlayersList(p2, ['P1', 'P2']);

		button = p2.findElement(By.id('startGameButton'));
		await expect(button.isDisplayed()).to.eventually.be.true;
		await button.click();
		// Wait for game start animation to complete
		await p2.sleep(4000);

		// Steps of next game, P2 wins again
		await pressTile(p1, 5)
		await pressTile(p2, 1)

		// Each player should see the appropriate message
		await expect(p1.findElement(By.css('#winScreen')).isDisplayed()).to.eventually.be.true;
		await expect(p1.findElement(By.css('#winScreen .winScreenMessage')).getText()).to.eventually.equal("P2\nWINS!");
		await expect(p2.findElement(By.css('#winScreenWithPrompt')).isDisplayed()).to.eventually.be.true;
		await expect(p2.findElement(By.css('#winScreenWithPrompt .winScreenMessage')).getText()).to.eventually.equal("YOU WIN,\nP2!");

		// Wait for the post-game options to be displayed
		await p2.sleep(1000);

		// P2 should see the post-game options but not take action
		button = p2.findElement(By.id('postWinOptOutButton'));
		await expect(button.isDisplayed()).to.eventually.be.true;

		// Wait for game end animation to complete
		await p1.sleep(5000);

		// Winners list should be updated accordingly
		// Returned text should contain number of wins (last character)
		await expectWinnersList(p1, ['P22']);
		await expectWinnersList(p2, ['P22']);

		// Players list should be updated
		await expectPlayersList(p1, ['P1']);
		await expectPlayersList(p2, ['P1']);

		// Start game button should only be visible to P1 since P2 has left
		await expect(p1.findElement(By.id('startGameButton')).isDisplayed()).to.eventually.be.true;
		await expect(p2.findElement(By.id('startGameButton')).isDisplayed()).to.eventually.be.false;
	})

	it("handles connection failure", async function() {
		await waitForPageLoad(p1);
		await waitForPageLoad(p2);

		// P1 joins the game
		await p1.findElement(By.id('joinGameButton')).click();
		await p1.sleep(1000);
		await p1.findElement(By.id('playerInput')).sendKeys("P1", Key.RETURN);
		await p1.sleep(1000);

		// P2 joins the game
		await p2.findElement(By.id('joinGameButton')).click();
		await p2.sleep(1000);
		await p2.findElement(By.id('playerInput')).sendKeys("P2", Key.RETURN);
		await p2.sleep(1000);

		// P1 starts the game
		await p1.findElement(By.id('startGameButton')).click();
		// Wait for game start animation to complete
		await p1.sleep(4000)

		// P1 presses tile
		await pressTile(p1, 2);

		// P2 suddenly navigates away
		await p2.get('about:blank')
		await p1.sleep(1000)

		// Players list should be visible and updated
		await expect(p1.findElement(By.id('playersList')).isDisplayed()).to.eventually.be.true;
		await expectPlayersList(p1, ['P1']);

		// P2 can rejoin
		await waitForPageLoad(p2);
		await p2.findElement(By.id('joinGameButton')).click();
		await p2.sleep(1000);
		// P2 does not need to re-enter name
		await p2.findElement(By.id('playerInput')).sendKeys(Key.RETURN);
		await p2.sleep(1000);

		await expectPlayersList(p1, ['P1', 'P2']);
		await expectPlayersList(p2, ['P1', 'P2']);
	})

	it("handles midgame exit", async function() {
		await waitForPageLoad(p1);
		await waitForPageLoad(p2);

		// P1 joins the game
		await p1.findElement(By.id('joinGameButton')).click();
		await p1.sleep(1000);
		await p1.findElement(By.id('playerInput')).sendKeys("P1", Key.RETURN);
		await p1.sleep(1000);

		// P2 joins the game
		await p2.findElement(By.id('joinGameButton')).click();
		await p2.sleep(1000);
		await p2.findElement(By.id('playerInput')).sendKeys("P2", Key.RETURN);
		await p2.sleep(1000);

		// P1 starts the game
		await p1.findElement(By.id('startGameButton')).click();
		// Wait for game start animation to complete
		await p1.sleep(4000)

		// P1 presses tile
		await pressTile(p1, 2);

		// P2 suddenly navigates away
		await p2.findElement(By.id('exitGameButton')).click();
		await p1.sleep(1000)

		// Players list should be visible and updated
		await expect(p1.findElement(By.id('playersList')).isDisplayed()).to.eventually.be.true;
		await expectPlayersList(p1, ['P1']);

		// P2 can rejoin
		await waitForPageLoad(p2);
		await p2.sleep(1000);
		await p2.findElement(By.id('joinGameButton')).click();
		await p2.sleep(1000);
		// P2 does not need to re-enter name
		await p2.findElement(By.id('playerInput')).sendKeys(Key.RETURN);
		await p2.sleep(1000);

		await expectPlayersList(p1, ['P1', 'P2']);
		await expectPlayersList(p2, ['P1', 'P2']);
	})

	it("handles player timeout", async function() {
		await waitForPageLoad(p1);
		await waitForPageLoad(p2);

		// P1 joins the game
		await p1.findElement(By.id('joinGameButton')).click();
		await p1.sleep(1000);
		await p1.findElement(By.id('playerInput')).sendKeys("P1", Key.RETURN);
		await p1.sleep(1000);

		// P2 joins the game
		await p2.findElement(By.id('joinGameButton')).click();
		await p2.sleep(1000);
		await p2.findElement(By.id('playerInput')).sendKeys("P2", Key.RETURN);
		await p2.sleep(1000);

		// P1 starts the game
		await p1.findElement(By.id('startGameButton')).click();
		// Wait for game start animation to complete
		await p1.sleep(4000)

		// P1 presses tile, P2 takes no action
		await pressTile(p1, 2);
		await p2.sleep(12000);

		// Players list should be visible
		await expect(p1.findElement(By.id('playersList')).isDisplayed()).to.eventually.be.true;
		// Both players should still be present, even though P2 timed out
		await expectPlayersList(p1, ['P1', 'P2']);

		// P2 can restart game
		await p2.findElement(By.id('startGameButton')).click();
		await p2.sleep(1000);
		await expect(p1.findElement(By.id('playersList')).isDisplayed()).to.eventually.be.false;
	})

	it("allows clients to watch, connected before game", async function() {
		await waitForPageLoad(p1);
		await waitForPageLoad(p2);

		// P1 joins the game
		await p1.findElement(By.id('joinGameButton')).click();
		await p1.sleep(1000);
		await p1.findElement(By.id('playerInput')).sendKeys("P1", Key.RETURN);
		await p1.sleep(1000);

		// P1 starts the game
		await p1.findElement(By.id('startGameButton')).click();
		// Wait for game start animation to complete
		await p1.sleep(4000)

		// P2 should still see the game in focus and should not be able to join
		await expect(p2.findElement(By.id('playersList')).isDisplayed()).to.eventually.be.false;
		await expect(p2.findElement(By.id('joinGameButton')).isDisplayed()).to.eventually.be.false;

		// P1 presses two tiles to win, P2 should see that on their board
		await pressTile(p1, 2);
		await expect(isTilePressed(p2, 2)).to.eventually.be.true;
		await p1.sleep(1000);
		await pressTile(p1, 1);
		await expect(isTilePressed(p2, 1)).to.eventually.be.true;
		await p1.sleep(1000);

		// P1 presses button to keep themselves on list
		await p1.findElement(By.id('postWinOptInButton')).click();

		// Wait until the player list appears again
		await p2.sleep(3000);

		// P1 should be listed on both lists
		await expectPlayersList(p1, ['P1']);
		await expectPlayersList(p2, ['P1']);
		await expectWinnersList(p1, ['P11']);
		await expectWinnersList(p2, ['P11']);

		// P2 should now be able to join again
		await expect(p2.findElement(By.id('joinGameButton')).isDisplayed()).to.eventually.be.true;
	})

	it("allows clients to watch, connected during game", async function() {
		await waitForPageLoad(p1);

		// P1 joins the game
		await p1.findElement(By.id('joinGameButton')).click();
		await p1.sleep(1000);
		await p1.findElement(By.id('playerInput')).sendKeys("P1", Key.RETURN);
		await p1.sleep(1000);

		// P1 starts the game
		await p1.findElement(By.id('startGameButton')).click();
		// Wait for game start animation to complete
		await p1.sleep(4000)

		// P1 presses a tile before p2 joins
		await pressTile(p1, 2);
		await p1.sleep(1000);

		// P2 loads page now, and should be able to watch but not join
		await waitForPageLoad(p2);
		await p2.sleep(1000)

		// P2 should still see the game in focus and should not be able to join
		await expect(p2.findElement(By.id('playersList')).isDisplayed()).to.eventually.be.false;
		await expect(p2.findElement(By.id('joinGameButton')).isDisplayed()).to.eventually.be.false;

		// P1 presses two tiles to win, P2 should still see them
		await expect(isTilePressed(p2, 2)).to.eventually.be.true;
		await pressTile(p1, 1);
		await expect(isTilePressed(p2, 1)).to.eventually.be.true;
		await p1.sleep(1000);

		// P1 presses button to keep themselves on list
		await p1.findElement(By.id('postWinOptInButton')).click();

		// Wait until the player list appears again
		await p2.sleep(3000);

		// P1 should be listed on both lists
		await expectPlayersList(p1, ['P1']);
		await expectPlayersList(p2, ['P1']);
		await expectWinnersList(p1, ['P11']);
		await expectWinnersList(p2, ['P11']);

		// P2 should now be able to join again
		await expect(p2.findElement(By.id('joinGameButton')).isDisplayed()).to.eventually.be.true;
	})

	it("prevents duplicate names", async function() {
		await waitForPageLoad(p1);
		await waitForPageLoad(p2);

		// P1 joins the game
		await p1.findElement(By.id('joinGameButton')).click();
		await p1.sleep(1000);
		await p1.findElement(By.id('playerInput')).sendKeys("P1", Key.RETURN);
		await p1.sleep(1000);
		await expectPlayersList(p1, ['P1']);

		// P2 attempts to join the game with name "P1"
		await p2.findElement(By.id('joinGameButton')).click();
		await p2.sleep(1000);
		await p2.findElement(By.id('playerInput')).sendKeys("P1", Key.RETURN);
		await p2.sleep(1000);

		// Player list should be unchanged for both
		await expectPlayersList(p1, ['P1']);
		await expectPlayersList(p2, ['P1']);
		// P2 should be able to try joining again
		await expect(p2.findElement(By.id('joinGameButton')).isDisplayed()).to.eventually.be.true;

	})
})

async function waitForPageLoad(driver) {
	return driver.get('http://localhost:3000/').then(async function() {
		driver.wait(function() {
			return hasClass(driver.findElement(By.tagName("body")), "pageLoaded")
		}, 2000)
	})
}

async function hasClass(targetElement, expectedClass) {
	return targetElement.then(function(element) {
		return element.getAttribute("class").then(function(cls) {
			return cls.includes(expectedClass)
		})
	})
}

async function expectPlayersList(driver, expected) {
	return getListContents(driver, '#playersList li:not(.inactive)').then(async function(items) {
		return expect(items).to.be.equalTo(expected);
	})
}

async function expectWinnersList(driver, expected) {
	return getListContents(driver, '#winnersList li').then(async function(items) {
		return expect(items).to.be.equalTo(expected);
	})
}

async function getListContents(driver, selector) {
	return driver.findElements(By.css(selector)).then(async function(items) {
		return Promise.all(items.map(async function(element) {
			return element.getText();
		}))
	})
}

async function pressTile(driver, i) {
	return driver.findElement(By.css('#flashpad a:nth-child(' + i + ')')).click().then(async function() {
		return driver.sleep(1000)
	})
}

async function isTilePressed(driver, i) {
	return hasClass(driver.findElement(By.css('#flashpad a:nth-child(' + i + ')')), "green");
}