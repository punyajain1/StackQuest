const axios = require('axios');
async function run() {
  const res = await axios.get('https://api.stackexchange.com/2.3/filters/create', {
    params: {
      include: 'answer.body;answer.body_markdown;answer.is_accepted;answer.owner;answer.question_id;answer.score;question.accepted_answer_id;question.answer_count;question.body;question.body_markdown;question.creation_date;question.is_answered;question.owner;question.score;question.tags;question.title;question.view_count;shallow_user.display_name;shallow_user.reputation',
      unsafe: false
    }
  });
  console.log(res.data.items[0].filter);
}
run();
