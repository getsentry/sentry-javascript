export default function timeout(time: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, time));
}
