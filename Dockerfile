# Gunakan Node.js
FROM node:20-alpine

# Working directory
WORKDIR /app

# Copy package.json & package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy seluruh source code
COPY . .

# Expose port React
EXPOSE 3000

# Jalankan dev server
CMD ["npm", "start"]