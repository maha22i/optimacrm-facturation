export function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.statusCode ? err.message : 'Internal server error';

  if (process.env.NODE_ENV === 'development') {
    console.error(`[ERROR ${statusCode}]`, err.message, err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && statusCode === 500 && { stack: err.stack }),
  });
}
