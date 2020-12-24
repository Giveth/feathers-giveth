export function toFn(promise: Promise<any>) {
  return promise.then(result => [null, result]).catch(err => [err]);
};
