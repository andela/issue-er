module.exports = {
  FindProjectColumnID: `
    query FindProjectByName($owner: String!, $name: String!, $projectName: String!) {
      repository(owner: $owner, name: $name) {
        projects(first: 1, search: $projectName){
          edges {
            node {
              columns(first:1) {
                edges {
                  node {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
  FindProjectColumnIDs: `
    query FindProjectColumnIDs($owner:String!, $name:String!, $projectName:String!) {
      repository(owner:$owner,name:$name) {
        projects(first:1, search:$projectName){
          edges {
            node {
              columns(first:7) {
                totalCount
                edges {
                  node {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
  FindIssueID: `
     query FindIssueID($owner: String!, $name: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $issueNumber) {
          id
        }
      }
    }
  `,
  AddProjectCard: `
    mutation AddProjectCard($issue: AddProjectCardInput!) {
      addProjectCard(input: $issue) {
        cardEdge {
          node {
            id
          }
        }
        projectColumn {
          id
        },
        clientMutationId
      }
    }
  `,
  MoveProjectCard: `
    mutation MoveProjectCard($card: MoveProjectCardInput!) {
      moveProjectCard(input: $card) {
        cardEdge {
          node {
            id
          }
        }
        clientMutationId
      }
    }
  `,
  AddComment: `
    mutation AddComment($issue: AddCommentInput!) {
      addComment(input:$issue) {
        commentEdge {
          node {
            id
          }
        }
        clientMutationId
      }
    }
  `
}

