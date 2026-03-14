FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ libvips-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /app/data/product-images

EXPOSE 3099

CMD ["node", "src/index.js"]
