FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY src/ src/
COPY migrations/ migrations/
EXPOSE 3000
CMD ["sh", "-c", "node src/migrate.js && node src/app.js"]
