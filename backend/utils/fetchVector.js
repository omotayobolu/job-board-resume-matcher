const index = require("../config/pinecone");

const fetchVector = async (id, namespace) => {
  try {
    const ns = index.namespace(namespace);
    const response = await ns.fetch([id]);

    console.log("Fetch response:", response);

    const record = response.records[id];

    if (record) {
      return record.values;
    } else {
      console.error("No vector found for ID:", id);
      return null;
    }
  } catch (error) {
    console.error("Error fetching vector:", error);
    return null;
  }
};
module.exports = { fetchVector };
