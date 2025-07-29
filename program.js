import { createReadStream } from 'fs';
import csv from 'csv-parser';
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer';

// API Documentation: https://imdbapi.dev/

const INPUT_FILE = 'input.csv';
const OUTPUT_FILE = 'output.csv';
const API_URL = 'https://rest.imdbapi.dev/v2';
const API_SEARCH_URL = API_URL + '/search/titles?query={query}';
const API_TITLE_URL = API_URL + '/titles/{id}';

function fullResponse(response) {
  const headers = {};
  for (const [key, value] of response.headers.entries()) {
    headers[key] = value;
  }

  return `Status: ${response.status}
Status Text: ${response.statusText}
URL: ${response.url}
Headers: ${JSON.stringify(headers, null, 2)}
Type: ${response.type}
Redirected: ${response.redirected}`;
}

async function fetchIMDBData(title, year, id) {
  const query = `${title} ${year && year !== 'N/A' ? year : ''}`.trim();
  const url = id
    ? API_TITLE_URL.replace('{id}', id)
    : API_SEARCH_URL.replace('{query}', encodeURIComponent(query));

  try {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await fetch(url, {
        method: 'GET',
      });

      if (response.status === 429) { // Too many requests, wait before retrying
        const retryAfterSeconds = response.headers.get('Retry-After');
        const waitTimeSeconds = retryAfterSeconds ? parseInt(retryAfterSeconds) : 2 ** attempt; // Exponential backoff
        console.warn(`Rate limit exceeded. Retrying after ${waitTimeSeconds} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTimeSeconds * 1000));
        continue; // Retry the request
      }

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data?.titles?.[0]; // Take first match
    }
    throw new Error('Max attempts reached without a successful response');
  } catch (error) {
    console.error(`Error fetching data for "${title}" (${year}):\n${error}`);
    return null;
  }
}

function score(rating, votes) {
  return Math.round((rating ** 4 * Math.log10(votes + 1) / 100));
}

(async () => {
  const results = [];

  const input = createReadStream(INPUT_FILE).pipe(csv());

  for await (const row of input) {
    const { Title, Year, Type, Rating, Votes, ID } = row;

    let imdbData = null;
    //console.log(`Fetching: ${Title} (${Year})`);
    //imdbData = await fetchIMDBData(Title, Year, ID);

    let type = imdbData?.type || Type;
    switch (type) {
      case 'movie':
      case 'tvMovie':
        type = 'Movie';
        break;
      case 'tvMiniSeries':
      case 'tvMiniSeries':
      case 'tvShort':
      case 'tvSpecial':
      case 'tvSeries':
        type = 'TV Series';
        break;
      default:
        type = type || '';
    }

    results.push({
      title:  imdbData?.primary_title || Title,
      year:   imdbData?.start_year || Year,
      type:   type,
      rating: imdbData?.rating?.aggregate_rating || Rating,
      votes:  imdbData?.rating?.votes_count || Votes,
      score:  score(imdbData?.rating?.aggregate_rating || Rating, imdbData?.rating?.votes_count || Votes),
      id:     imdbData?.id || ID,
      link:   imdbData?.id || ID ? `https://www.imdb.com/title/${imdbData?.id || ID}` : '',
    });
  }

  // sort results by score descending
  results.sort((a, b) => b.score - a.score);

  const output = createCsvWriter({
    path: OUTPUT_FILE,
    header: [
      { id: 'title', title: 'Title' },
      { id: 'year', title: 'Year' },
      { id: 'type', title: 'Type' },
      { id: 'rating', title: 'Rating' },
      { id: 'votes', title: 'Votes' },
      { id: 'score', title: 'Score' },
      { id: 'id', title: 'ID' },
      { id: 'link', title: 'Link' },
    ]
  });

  await output.writeRecords(results);
  console.log(`✅ Done! Output written to ${OUTPUT_FILE}`);
})();
