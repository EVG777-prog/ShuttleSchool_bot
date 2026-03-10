const trialLesson = require("./data/trialLesson.json");
const testFrench = require("./data/testFrench.json");
const testSpain = require("./data/testSpain.json");
const testItalian = require("./data/testItalian.json");

const flow = { ...trialLesson };

const tests = {
  french: testFrench,
  spain: testSpain,
  italian: testItalian,
};

const userState = {};
const userAnswers = {};

module.exports = { flow, tests, userState, userAnswers };
