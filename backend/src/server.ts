import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error('PORT debe ser un entero entre 0 y 65535.');
}

createApp().listen(port, () => {
  console.info(`Backend escuchando en el puerto ${port}.`);
});
