FROM nginx:alpine

# Copy files directly without removing first (let's see what happens)
COPY . /usr/share/nginx/html/

# Just use default nginx config for now
# Don't copy custom config

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
