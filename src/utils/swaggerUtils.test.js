const mongoose = require('mongoose');
const { assert } = require('chai');
const { generateSwaggerDocForCRUDService } = require('./swaggerUtils');
const { generateRandomNumber } = require('../../test/testUtility');

const generateSwaggerDocForCRUDServiceTestCases = () => {
  it('should return swagger schema from mongoose model', () => {
    const testModel = mongoose.model(`test-${generateRandomNumber(1, 10000)}`, {
      name: String,
      lastName: String,
    });
    const generatedSchema = generateSwaggerDocForCRUDService({ Model: testModel });
    assert.exists(generatedSchema.securities);
    assert.exists(generatedSchema.definition);
    assert.exists(generatedSchema.operations);
    assert.equal(generatedSchema.operations.remove, false);
    assert.exists(generatedSchema.definition.properties.name);
    assert.exists(generatedSchema.definition.properties.lastName);
    assert.equal(generatedSchema.operations.find.parameters[0].name, '$limit');
    assert.equal(generatedSchema.operations.find.parameters[1].name, '$skip');
  });
  it('should disabledMethods set method false', () => {
    const testModel = mongoose.model(`test-${generateRandomNumber(1, 10000)}`, {
      name: String,
      lastName: String,
      age: Number,
    });
    const generatedSchema = generateSwaggerDocForCRUDService({ Model: testModel }, ['create']);
    assert.equal(generatedSchema.operations.create, false);
    assert.notExists(generatedSchema.operations.remove);
  });
  it('should add fields to operation find parameters', () => {
    const testModel = mongoose.model(`test-${generateRandomNumber(1, 10000)}`, {
      name: String,
      lastName: String,
      age: Number,
    });
    const generatedSchema = generateSwaggerDocForCRUDService({ Model: testModel });
    assert.equal(generatedSchema.operations.find.parameters[2].name, 'name');
    assert.equal(generatedSchema.operations.find.parameters[3].name, 'lastName');
  });
  it('should not add non-string fields to find operation parameters', () => {
    const testModel = mongoose.model(`test-${generateRandomNumber(1, 10000)}`, {
      name: String,
      lastName: String,
      age: Number,
      alive: Boolean,
    });
    const generatedSchema = generateSwaggerDocForCRUDService({ Model: testModel });
    assert.equal(generatedSchema.operations.find.parameters[2].name, 'name');
    assert.equal(generatedSchema.operations.find.parameters[3].name, 'lastName');
    assert.notExists(generatedSchema.operations.find.parameters[4]);
    assert.notExists(generatedSchema.operations.find.parameters[5]);
  });
  it('should not add verified field in find operation', () => {
    const testModel = mongoose.model(`test-${generateRandomNumber(1, 10000)}`, {
      name: String,
      lastName: String,
      age: Number,
      alive: Boolean,
    });
    const generatedSchema = generateSwaggerDocForCRUDService({ Model: testModel });
    assert.equal(generatedSchema.operations.find.parameters[2].name, 'name');
    assert.equal(generatedSchema.operations.find.parameters[3].name, 'lastName');
    assert.notExists(generatedSchema.operations.find.parameters[4]);
    assert.notExists(generatedSchema.operations.find.parameters[5]);
  });
  it('should add verified field in find operation', () => {
    const testModel = mongoose.model(`test-${generateRandomNumber(1, 1000)}-${new Date()}`, {
      name: String,
      lastName: String,
      verified: Boolean,
    });
    const generatedSchema = generateSwaggerDocForCRUDService({ Model: testModel });
    assert.equal(generatedSchema.operations.find.parameters[2].name, 'name');
    assert.equal(generatedSchema.operations.find.parameters[3].name, 'lastName');
    assert.equal(generatedSchema.operations.find.parameters[4].name, 'verified');
    assert.exists(generatedSchema.operations.find.parameters[4].schema.enum);
  });
};

describe('generateSwaggerDocForCRUDService test cases', generateSwaggerDocForCRUDServiceTestCases);
