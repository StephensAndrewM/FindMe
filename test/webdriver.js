const chai = require("chai");
const chaiAsPromised = require('chai-as-promised');
const chaiArrays = require('chai-arrays');

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

	var p1, p2;

	beforeEach(function() {
		p1 = new Builder()
			.forBrowser('chrome')
			.setChromeOptions(options)
			.build();
		p2 = new Builder()
			.forBrowser('chrome')
			.setChromeOptions(options)
			.build();
	})

	afterEach(function() {
		p1.quit();
		p2.quit();
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
		await p2.sleep(4000)

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
		await p1.sleep(5000)

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

		// Tests crash if we don't sleep for a bit here
		await p2.sleep(1)
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