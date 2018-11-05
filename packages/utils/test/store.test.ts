import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';

import { Store } from '../src/store';

jest.useFakeTimers();

const folder = join(os.tmpdir(), 'test');
const filename = 'data';
const finalFilename = join(folder, `${filename}.json`);
const inital = ['a', 'b'];
let store: Store<string[]>;

describe('Store', () => {
  beforeEach(() => {
    if (fs.existsSync(finalFilename)) {
      fs.unlinkSync(finalFilename);
    }
    if (fs.existsSync(folder)) {
      fs.rmdirSync(folder);
    }
    store = new Store<string[]>(folder, filename, inital);
  });

  it('should create a store with inital value', async () => {
    expect(fs.existsSync(folder)).to.be.false;
    expect(fs.existsSync(finalFilename)).to.be.false;
    expect(store.get()).to.deep.equal(inital);
  });

  it('should set new value into the store', async () => {
    store.set(['c']);

    jest.runAllTimers();

    expect(fs.existsSync(folder)).to.be.true;
    expect(fs.existsSync(finalFilename)).to.be.true;

    expect(store.get()).to.deep.equal(['c']);
  });

  it('should update current store', async () => {
    store.update(current => current.map(value => `${value}1`));
    expect(store.get()).to.deep.equal(['a1', 'b1']);
    store.update(current => current.map(value => `${value}1`));
    expect(store.get()).to.deep.equal(['a11', 'b11']);
  });

  it('should clear current store', async () => {
    store.update(current => current.map(value => `${value}1`));
    expect(store.get()).to.deep.equal(['a1', 'b1']);
    store.clear();
    jest.runAllTimers();

    expect(store.get()).to.deep.equal(['a', 'b']);
  });

  it('should create all intermediate folders', async () => {
    const newPath = join(folder, 'test');
    store = new Store<string[]>(newPath, filename, inital);
    store.update(current => current.map(value => `${value}1`));
    jest.runAllTimers();
    const realFilename = join(newPath, `${filename}.json`);
    expect(fs.existsSync(folder)).to.be.true;
    expect(fs.existsSync(newPath)).to.be.true;
    expect(fs.existsSync(realFilename)).to.be.true;
    fs.unlinkSync(realFilename);
    fs.rmdirSync(newPath);
  });
});
