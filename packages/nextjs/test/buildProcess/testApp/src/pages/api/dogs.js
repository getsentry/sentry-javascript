import * as fs from 'fs';
import * as path from 'path';

export default function handler(req, res) {
  const dogData = JSON.parse(fs.readFileSync(path.resolve('../../dogs.json')));
  dogData.test = 'something';
  res.status(200).json(dogData);
}
