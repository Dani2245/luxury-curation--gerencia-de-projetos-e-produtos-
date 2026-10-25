import webdriver from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { BASE_URL, HEADLESS, PASSWORD } from './config.js';

const { Builder, By, Key, until } = webdriver;
const TIMEOUT = 10000;

export const createDriver = async () => {
  const options = new chrome.Options().addArguments('--window-size=1366,900', '--lang=pt-BR');
  if (HEADLESS) options.addArguments('--headless=new');
  return new Builder().forBrowser('chrome').setChromeOptions(options).build();
};

export const open = (driver, path = '/') => driver.get(`${BASE_URL}${path}`);

export const byLabel = (driver, text) => driver.findElement(By.css(`[aria-label="${text}"]`));

export const waitForPath = (driver, path) =>
  driver.wait(async () => new URL(await driver.getCurrentUrl()).pathname === path, TIMEOUT, `Esperava estar em ${path}`);

export const waitVisible = async (driver, locator) => {
  const element = await driver.wait(until.elementLocated(locator), TIMEOUT);
  await driver.wait(until.elementIsVisible(element), TIMEOUT);
  return element;
};

export const waitForText = (driver, text) =>
  driver.wait(until.elementLocated(By.xpath(`//*[contains(normalize-space(.), "${text}")]`)), TIMEOUT, `Texto não encontrado: ${text}`);

export const waitGone = (driver, text) =>
  driver.wait(async () => (await driver.findElements(By.xpath(`//*[contains(text(), "${text}")]`))).length === 0, TIMEOUT, `Texto ainda visível: ${text}`);

export const clickButton = async (driver, text) => {
  const button = await driver.wait(until.elementLocated(By.xpath(`//button[normalize-space(.)="${text}"]`)), TIMEOUT);
  await driver.executeScript('arguments[0].scrollIntoView({block: "center"})', button);
  await driver.wait(until.elementIsEnabled(button), TIMEOUT);
  await button.click();
};

export const clickLabeled = async (driver, label) => {
  const element = await driver.wait(until.elementLocated(By.css(`[aria-label="${label}"]`)), TIMEOUT);
  await driver.executeScript('arguments[0].scrollIntoView({block: "center"})', element);
  await element.click();
};

// Substitui o conteúdo de um campo (inclui type=number)
export const fill = async (driver, id, value) => {
  const field = await driver.wait(until.elementLocated(By.id(id)), TIMEOUT);
  await driver.executeScript('arguments[0].scrollIntoView({block: "center"})', field);
  // clear() não dispara o evento de input que o React observa; apagar pelo teclado dispara
  await field.sendKeys(Key.chord(process.platform === 'darwin' ? Key.COMMAND : Key.CONTROL, 'a'), Key.BACK_SPACE);
  if (value !== '') await field.sendKeys(value);
};

export const select = async (driver, id, value) => {
  const field = await driver.wait(until.elementLocated(By.id(id)), TIMEOUT);
  await field.findElement(By.css(`option[value="${value}"]`)).click();
};

export const alertText = async (driver) => {
  const element = await waitVisible(driver, By.css('[role="alert"]'));
  return element.getText();
};

export const loginAs = async (driver, email, password = PASSWORD) => {
  await open(driver, '/login');
  await fill(driver, 'email', email);
  await fill(driver, 'password', password);
  await clickButton(driver, 'Entrar');
};

export const loginAndWaitDashboard = async (driver, email, password) => {
  await loginAs(driver, email, password);
  await waitForPath(driver, '/dashboard');
};

export const clearSession = async (driver) => {
  await open(driver, '/login');
  await driver.executeScript('localStorage.clear()');
};

// Texto das linhas de uma tabela (tbody), lido em uma única chamada para evitar elementos obsoletos
export const tableRows = (driver) =>
  driver.executeScript('return [...document.querySelectorAll("tbody tr")].map((row) => row.innerText.trim())');
