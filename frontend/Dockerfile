FROM node:20-slim

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Start the Vite dev server
CMD ["npm", "run", "dev", "--", "--host"]