import {
  DEFAULT_ROUTING,
  ROUTING_RULE,
  ROUTING_RULE_ELSE,
} from "./constants.js";
import { stripHTML } from "./utils.js";

const authorDestinationToId = ({ pageId, sectionId, logical }) =>
  pageId || sectionId || logical;

const traverseTree = (tree, λ) => {
  if (!tree || typeof tree !== "object") {
    return;
  }
  λ(tree);
  Object.keys(tree).forEach((key) => traverseTree(tree[key], λ));
};

const buildIdHashIndex = (questionnaire) => {
  const index = new Map();
  traverseTree(questionnaire, (obj) => {
    if (obj.id) index.set(obj.id, obj);
  });
  return index;
};

const parseAuthorRouting = (routing, idIndex) =>
  routing
    ? [
        ...routing.rules.map((rule) => ({
          destinationId: authorDestinationToId(rule.destination),
          conditionDescription: parseExpressionGroup(
            rule.expressionGroup,
            idIndex
          ),
          type: ROUTING_RULE,
        })),
        {
          destinationId: authorDestinationToId(routing.else),
          type: ROUTING_RULE_ELSE,
        },
      ]
    : [{ destinationId: "NextPage", type: DEFAULT_ROUTING }];

// ----
// Utilities for parsing expression groups

const parseRightHandSide = (right, idIndex) => {
  switch (right.type) {
    case "SelectedOptions":
      return right.optionIds
        .map(
          (id) =>
            `<span class="option">${
              stripHTML(idIndex.get(id)?.label?.trim()) || "<ANSWER NOT FOUND>"
            }</span>`
        )
        .join(", ");
    case "Custom":
      return right.customValue.number;
    default:
      return "<UNKNOWN TYPE>";
  }
};

const parseLeftHandSide = (left, idIndex) => {
  const answer = idIndex.get(left.answerId) || {};
  const { qCode, label, questionPageId } = answer;
  const questionPage = idIndex.get(questionPageId);
  return `<abbr title="${
    stripHTML(qCode ? label || questionPage?.title : questionPage?.title) ||
    "Unknown"
  }">${stripHTML(qCode || label || "[UNKNOWN ANSWER]")}</abbr>`;
};

const parseCondition = (condition) => {
  switch (condition) {
    case "OneOf":
      return "one of";
    case "AnyOf":
      return "any of";
    case "AllOf":
      return "all of";
    case "Equal":
      return "equal to";
    case "Unanswered":
      return "unanswered";
    default:
      return "[unknown condition]";
  }
};

const parseExpression = ({ condition, left, right }, idIndex) =>
  `${parseLeftHandSide(
    left,
    idIndex
  )} is <span class="condition">${parseCondition(condition)}</span> ${
    condition === "Unanswered" ? "" : parseRightHandSide(right, idIndex)
  }`;

const parseExpressionGroup = ({ operator, expressions }, idIndex) =>
  expressions
    .map((expr) => parseExpression(expr, idIndex))
    .join(
      ` <span class="operator">${operator?.toUpperCase() || "AND"}</span> `
    );

// ----

export default (questionnaire) => {
  const idIndex = buildIdHashIndex(questionnaire);

  const questions = questionnaire.sections
    .flatMap(({ id, folders }) =>
      folders.flatMap(({ pages }) =>
        pages.map((page) => ({ ...page, sectionId: id }))
      )
    )
    .filter((page) => page.pageType !== "CalculatedSummaryPage");

  const data = [
    {
      id: "EndOfQuestionnaire",
      alias: "End",
      title: "End of Questionnaire",
    },
  ];
  const links = [];
  const questionIdIndex = {};

  // Iterate through questions backwards - ensures that indicies of destination questions
  // are already known when we get to their sources, enabling easy lookup
  for (let index = questions.length - 1; index >= 0; index--) {
    const {
      id,
      alias,
      sectionId,
      title = "Untitled question",
      routing,
      skipConditions,
    } = questions[index];

    // Build a hash index of id -> index in data array so we can find the page's position quickly later
    questionIdIndex[sectionId] = index;
    questionIdIndex[id] = index;

    const skip = skipConditions || [];

    // Build data which will be found to SVG elements in D3 - needs to know alias (short name)
    // and title of question (shown on mouseover)
    data.unshift({
      id,
      alias: stripHTML(alias),
      title: stripHTML(title),
      skip,
    });

    const logicalDestinationToIndex = {
      NextPage: index + 1,
      EndOfQuestionnaire: questions.length - 1,
    };

    // Generate link information for D3 - needs source + target indices to refer to
    // position within data array, hence we map from author ID to data index here
    // link object also contains type info (routing rule, default routing, etc.)
    // & readable explanation for the condition which needs to be met for the rule to activate
    parseAuthorRouting(routing, idIndex).forEach(
      ({ destinationId, type, conditionDescription }) => {
        links.push({
          source: index,
          target:
            logicalDestinationToIndex[destinationId] ||
            questionIdIndex[destinationId],
          type,
          conditionDescription,
        });
      }
    );
  }

  return { data, links };
};
