import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import httpStatus from 'http-status';
import httpMocks from 'node-mocks-http';
import { errorConverter, errorHandler } from '../../../src/middlewares/error.js';
import ApiError from '../../../src/utils/ApiError.js';
import config from '../../../src/config/config.js';
import logger from '../../../src/config/logger.js';

describe('Error middlewares', () => {
  describe('Error converter', () => {
    test('should return the same ApiError object it was called with', () => {
      const error = new ApiError(httpStatus.BAD_REQUEST, 'Any error');
      const next = jest.fn();

      errorConverter(error, httpMocks.createRequest(), httpMocks.createResponse(), next);

      expect(next).toHaveBeenCalledWith(error);
    });

    test('should convert an Error to ApiError and preserve its status and message', () => {
      const error = new Error('Any error');
      error.statusCode = httpStatus.BAD_REQUEST;
      const next = jest.fn();

      errorConverter(error, httpMocks.createRequest(), httpMocks.createResponse(), next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: error.statusCode,
          message: error.message,
          isOperational: false,
        }),
      );
    });

    test('should convert an Error without status to ApiError with status 500', () => {
      const error = new Error('Any error');
      const next = jest.fn();

      errorConverter(error, httpMocks.createRequest(), httpMocks.createResponse(), next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          message: error.message,
          isOperational: false,
        }),
      );
    });

    test('should convert an Error without message to ApiError with default message of that http status', () => {
      const error = new Error();
      error.statusCode = httpStatus.BAD_REQUEST;
      const next = jest.fn();

      errorConverter(error, httpMocks.createRequest(), httpMocks.createResponse(), next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: error.statusCode,
          message: httpStatus[error.statusCode],
          isOperational: false,
        }),
      );
    });

    test('should keep a status other than 400 (e.g. 413 from the body parser), not turn it into 400', () => {
      const error = new Error('request entity too large');
      error.statusCode = httpStatus.REQUEST_ENTITY_TOO_LARGE;
      const next = jest.fn();

      errorConverter(error, httpMocks.createRequest(), httpMocks.createResponse(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: httpStatus.REQUEST_ENTITY_TOO_LARGE }));
    });

    test('should convert a MongoDB duplicate-key error (11000) to an operational 409', () => {
      const error = new Error('E11000 duplicate key error collection: projects index: key_1 dup key: { key: "BT" }');
      error.code = 11000;
      const next = jest.fn();

      errorConverter(error, httpMocks.createRequest(), httpMocks.createResponse(), next);

      // The raw driver message names the collection and index: it must not reach the client.
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: httpStatus.CONFLICT, message: 'Already exists', isOperational: true }),
      );
    });

    test('should convert a Mongoose error to ApiError with status 400 and preserve its message', () => {
      const error = new mongoose.Error('Any mongoose error');
      const next = jest.fn();

      errorConverter(error, httpMocks.createRequest(), httpMocks.createResponse(), next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: httpStatus.BAD_REQUEST,
          message: error.message,
          isOperational: false,
        }),
      );
    });

    test('should convert any other object to ApiError with status 500 and its message', () => {
      const error = {};
      const next = jest.fn();

      errorConverter(error, httpMocks.createRequest(), httpMocks.createResponse(), next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          message: httpStatus[httpStatus.INTERNAL_SERVER_ERROR],
          isOperational: false,
        }),
      );
    });
  });

  describe('Error handler', () => {
    beforeEach(() => {
      jest.spyOn(logger, 'error').mockImplementation(() => {});
    });

    test('should send proper error response and put the error message in res.locals', () => {
      const error = new ApiError(httpStatus.BAD_REQUEST, 'Any error');
      const res = httpMocks.createResponse();
      const sendSpy = jest.spyOn(res, 'send');

      errorHandler(error, httpMocks.createRequest(), res);

      expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ code: error.statusCode, message: error.message }));
      expect(res.locals.errorMessage).toBe(error.message);
    });

    test('should put the error stack in the response if in development mode', () => {
      config.env = 'development';
      const error = new ApiError(httpStatus.BAD_REQUEST, 'Any error');
      const res = httpMocks.createResponse();
      const sendSpy = jest.spyOn(res, 'send');

      errorHandler(error, httpMocks.createRequest(), res);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ code: error.statusCode, message: error.message, stack: error.stack }),
      );
      config.env = process.env.NODE_ENV;
    });

    test('should send internal server error status and message if in production mode and error is not operational', () => {
      config.env = 'production';
      const error = new ApiError(httpStatus.BAD_REQUEST, 'Any error', false);
      const res = httpMocks.createResponse();
      const sendSpy = jest.spyOn(res, 'send');

      errorHandler(error, httpMocks.createRequest(), res);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          code: httpStatus.INTERNAL_SERVER_ERROR,
          message: httpStatus[httpStatus.INTERNAL_SERVER_ERROR],
        }),
      );
      expect(res.locals.errorMessage).toBe(error.message);
      config.env = process.env.NODE_ENV;
    });

    test('should preserve original error status and message if in production mode and error is operational', () => {
      config.env = 'production';
      const error = new ApiError(httpStatus.BAD_REQUEST, 'Any error');
      const res = httpMocks.createResponse();
      const sendSpy = jest.spyOn(res, 'send');

      errorHandler(error, httpMocks.createRequest(), res);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          code: error.statusCode,
          message: error.message,
        }),
      );
      config.env = process.env.NODE_ENV;
    });
  });
});
