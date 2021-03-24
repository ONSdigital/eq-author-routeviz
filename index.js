import transformSurvey from "./survey-transform.js";
import { ROUTING_RULE, ROUTING_RULE_ELSE, LINK_MESSAGES } from "./constants.js";
import { vectorShorten } from "./utils.js";

// Width, height of parent SVG element
const stage = document.getElementById("stage");
const arrowHeadLength = 10;

let width, height;
const updateDimensions = () => {
  width = stage.width.baseVal.value;
  height = stage.height.baseVal.value;
};
updateDimensions();

window.addEventListener("resize", updateDimensions);

// Size of question page circles
const radius = 24;

// getQuestionnaire: void -> object
const getQuestionnaire = async (questionnaireId) => {
  try {
    // Until CORS headers are added to Author API, use allorigins CORS proxy as a workaround
    const response = await fetch(
      `https://api.allorigins.win/get?url=https://prod-author.prod.eq.ons.digital/export/${questionnaireId}`
    );
    const json = await response.json();
    return JSON.parse(json.contents); // only needed due to way allorigins is sending back data
  } catch (e) {
    return null;
  }
};

const main = async () => {
  const questionnaireId = window.location.hash.substr(1);
  const questionnaire = await getQuestionnaire(questionnaireId);

  if (!questionnaire?.id) {
    document.body.innerHTML = `
      <h1>⚠️ Error fetching questionnaire</h1>
      <p>Unable to retrieve questionnaire from eQ Author with the given ID.</p>
      <p>Provide the ID as a hash after the URL, i.e.: <pre>http://author-routeviz.baggale.yt/#&lt;PROD_QUESTIONNAIRE_ID&gt;</pre></p>
      <h2>Examples</h2>
      <h3>MBS Construction</h3> <a href="http://author-routeviz.baggale.yt/#53ec4df5-f1c8-41b2-a8b0-24772a06c0b0">http://author-routeviz.baggale.yt/#53ec4df5-f1c8-41b2-a8b0-24772a06c0b0</a>
      <h3>MES</h3> <a href="http://author-routeviz.baggale.yt/#e9bffd55-25fe-4f14-9cad-da56b49e3ea7">http://author-routeviz.baggale.yt/#e9bffd55-25fe-4f14-9cad-da56b49e3ea7</a>
      <h3>BICS 27</h3> <a href="http://author-routeviz.baggale.yt/#fe3b8f84-1fc5-463c-9fc6-c26a5fdcf543">http://author-routeviz.baggale.yt/#fe3b8f84-1fc5-463c-9fc6-c26a5fdcf543</a>
    `;
    return;
  }

  document.getElementById("surveyname").innerText = questionnaire.title;

  const { data, links } = transformSurvey(questionnaire);

  const stage = d3.select("#stage");
  const zoom = d3
    .zoom()
    .extent([
      [0, 0],
      [width, height],
    ])
    .scaleExtent([0.25, 3])
    .on("zoom", ({ transform }) => globalGroup.attr("transform", transform));
  stage.call(zoom);

  const globalGroup = stage.append("g");

  let selectedNodeIndex = null;

  // Create linkage lines for each element in links data
  const linkLines = globalGroup
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .classed("routing", (d) => d.type === ROUTING_RULE)
    .classed("routingElse", (d) => d.type === ROUTING_RULE_ELSE);

  // Create nodes for each element in node data
  const nodes = globalGroup
    .selectAll("g")
    .data(data)
    .enter()
    .append("g")
    .attr("cursor", "pointer")
    .on("mouseover", (_, d) => {
      tooltip.style("opacity", 0.8);
      tooltip.text(d.title);
    })
    .on("mousemove", (event, d) => {
      const tooltipDOM = tooltip.node();
      tooltip.style("left", event.pageX - 0.5 * tooltipDOM.offsetWidth + "px");
      tooltip.style("top", event.pageY - tooltipDOM.offsetHeight - 50 + "px");
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    })
    .on("click", (_, d) =>
      selectNode(selectedNodeIndex === d.index ? null : d.index)
    );
  nodes
    .append("circle")
    .attr("r", radius)
    .classed("hasSkip", (d) => d?.skip?.length);
  nodes
    .append("text")
    .text((d) => d.alias)
    .attr("y", 5)
    .attr("text-anchor", "middle");

  const tooltip = d3.select("body").append("div").attr("class", "tooltip");

  const zoomToNode = (index) => {
    const d = data[index];
    stage
      .transition()
      .duration(750)
      .call(
        zoom.transform,
        d3.zoomIdentity.translate(-d.x + width / 2, -d.y + height / 2)
      );
  };
  window.zoomToNode = zoomToNode;

  // selectNode: index: int -> void
  // selects node with index nodeIndex
  const selectNode = (index) => {
    selectedNodeIndex = index;
    tooltip.style("opacity", 0);
    handleSelect();
  };
  window.selectNode = selectNode;

  // handleTick: void -> void; called per tick of physica simulation
  const handleTick = () => {
    linkLines
      .each((d) => {
        const [targetX, targetY] = vectorShorten(
          d.target.x - d.source.x,
          d.target.y - d.source.y,
          radius + arrowHeadLength
        );
        d.line = { targetX, targetY };
      })
      .attr("x1", (d) => d.source.x)
      .attr("x2", (d) => d.line.targetX + d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("y2", (d) => d.line.targetY + d.source.y);

    nodes.attr("transform", (d) => `translate(${d.x}, ${d.y})`);
  };

  const handleSelect = () => {
    const selectedQuestionInfo = d3.select("#selectedQuestionInfo");
    if (selectedNodeIndex === null) {
      nodes.classed("selected", false);
      nodes.classed("dimmed", false);
      linkLines.classed("dimmed", false);
      return selectedQuestionInfo.html("");
    }

    nodes.classed("selected", (d) => d.index === selectedNodeIndex);

    linkLines.classed(
      "dimmed",
      (d) =>
        d.source.index !== selectedNodeIndex &&
        d.target.index !== selectedNodeIndex
    );

    const routesOut = [],
      routesIn = [];
    for (const link of links) {
      if (link.source.index === selectedNodeIndex) {
        routesOut.push(link);
      }
      if (link.target.index === selectedNodeIndex) {
        routesIn.push(link);
      }
    }

    routesIn.sort((a, b) => a.source.index - b.source.index);
    routesOut.sort((a, b) => a.target.index - b.target.index);

    const linkedIndicies = routesOut
      .map((link) => link.target.index)
      .concat(routesIn.map((link) => link.source.index));

    nodes.classed(
      "dimmed",
      (d) => !linkedIndicies.includes(d.index) && d.index !== selectedNodeIndex
    );

    const selectedNode = data[selectedNodeIndex];

    const styleByRoutingType = ({ type, text }) =>
      `<span class="${
        type === ROUTING_RULE
          ? "routing"
          : type === ROUTING_RULE_ELSE
          ? "routingElse"
          : ""
      }">${text}</span>`;

    selectedQuestionInfo.html(`
    <h2>Question ${selectedNode.alias}</h2>
    <h3>${selectedNode.title}</h3>
    ${
      routesIn.length
        ? `<p>There are ${routesIn.length} routes in, from: ${routesIn
            .map(({ source, type }) =>
              styleByRoutingType({ type, text: source.alias })
            )
            .join(", ")
            .trim()}.</p>`
        : ""
    }
    ${
      routesOut.length
        ? `<p>There are ${routesOut.length} routes out, to: ${routesOut
            .map(({ target, type }) =>
              styleByRoutingType({ type, text: target.alias })
            )
            .join(", ")
            .trim()}.</p>`
        : ""
    }
    <h2>Inward routing rules</h2> ${renderRouteInfo(routesIn, true)}
    <h2>Outward routing rules</h2> ${renderRouteInfo(routesOut, false)}
  `);

    selectedQuestionInfo.node().scrollIntoView({ behavior: "smooth" });
  };

  const renderRouteInfo = (routes, inward) =>
    routes.length
      ? routes
          .map(({ source, target, type, conditionDescription = "" }) => {
            const { alias, index } = inward ? source : target;
            return `<div style="padding: 1em"><h3 style="display: inline">
                <a href="javascript:selectNode(${index});zoomToNode(${index})">${alias}</a>
                </h3> (${
                  conditionDescription
                    ? `<em><span class="operator">IF</span> ${conditionDescription}</em>`
                    : LINK_MESSAGES[type]
                })</div>`;
          })
          .join("")
      : "N/A";

  const simulation = d3
    .forceSimulation(data)
    .force("charge", d3.forceManyBody().strength(-10))
    .force("collide", d3.forceCollide(60))
    .force("center", d3.forceCenter(width / 2, height / 2).strength(0.75))
    .force(
      "y-axis-ordering",
      d3
        .forceY()
        .y((_, i) => i * 55)
        .strength(6)
    )
    .force("linkages", d3.forceLink().links(links).distance(100))
    .on("tick", handleTick);
};

main();

// Re-initialise the app whenever the hash changes
// (allows switching questionnaires without hard refresh)
window.addEventListener(
  "hashchange",
  window.location.reload.bind(window.location)
);
