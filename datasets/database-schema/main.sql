CREATE TABLE "requests"
(
  id bigserial primary key,
  request_id uuid,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  duration float,
  size int,
  status int
);