const trialLesson = require("./data/trialLesson.json");
const testFrench = require("./data/testFrench.json");
const testSpain = require("./data/testSpain.json");
const testItalian = require("./data/testItalian.json");
const testCzech = require("./data/testCzech.json");

const tests = {
  french: testFrench,
  spain: testSpain,
  italian: testItalian,
  czech: testCzech,
};

function createState() {
  return {
    flow: JSON.parse(JSON.stringify(trialLesson)),
    userState: {},
    userAnswers: {},
    tests: JSON.parse(JSON.stringify(tests)),
  };
}

module.exports = { createState };
