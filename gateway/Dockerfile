FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node gateway/ ./gateway/
USER node
ENV MARKET_DATA_HOST=0.0.0.0 MARKET_DATA_PORT=8787 NODE_ENV=production
EXPOSE 8787
CMD ["node", "gateway/server.mjs"]
