export const createdAt = (context) => {
  context.data.createdAt = new Date()
}

export const updatedAt = (context) => {
  context.data.updatedAt = new Date()
}

export default () => (context) => {
  updatedAt(context);
  createdAt(context);
};