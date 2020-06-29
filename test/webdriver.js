const expect = require("chai").expect;
const {
	Builder,
	By,
	Key
} = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const options = new chrome.Options()
options.addArguments('--disable-dev-shm-usage')
options.addArguments('--no-sandbox')

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
		await p1.get('http://localhost:3000/')
		await p2.get('http://localhost:3000/')

		await p1.wait(function() {
			return p1.findElement(By.tagName("body")).then(function(element) {
				return element.getAttribute("class").then(function(cls) {
					return cls.includes("pageLoaded")
				})
			})
		}, 2000)

		var p1StartButton = await p1.findElement(By.id('joinGameButton')).click();
		await p1.sleep(500);
		await p1.findElement(By.id('playerInput')).sendKeys("P1", Key.RETURN);
		await p1.sleep(500);

		var p1PlayerList = await p1.findElements(By.css('#playersList li'));
		var p2PlayerList = await p2.findElements(By.css('#playersList li'));

		p1PlayerNames = await Promise.all(p1PlayerList.map(async function(element) {
			return element.getText();
		}));
		p2PlayerNames = await Promise.all(p2PlayerList.map(async function(element) {
			return element.getText();
		}));

		expect(p1PlayerNames).to.include('P1');
		expect(p2PlayerNames).to.include('P1');
	})
})