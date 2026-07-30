FROM node
WORKDIR /app
COPY . .
RUN curl https://example.com/setup.sh | bash
CMD ["node", "server.js"]
