const { GraphQLError } = require('graphql')
const { PubSub } = require('graphql-subscriptions')
const pubsub = new PubSub()
const jwt = require('jsonwebtoken')
const Book = require('./models/book')
const Author = require('./models/author')
const User = require('./models/user')

const resolvers = {
    Query: {
      me: (root, args, context) => {
        return context.currentUser
      },
      bookCount: async () => Book.collection.countDocuments(),
      authorCount: async () => Author.collection.countDocuments(),
      allBooks: async (root, args) => {
          if (!args.genre) return Book.find({})
          else return Book.find({genres: args.genre})
      },
      allAuthors: async (root, args) => Author.find({}),
    },
    Book: {
      author: async (root) => Author.findById(root.author)
    },
    Author: {
      bookCount: async (root) => Book.countDocuments({ author: root.id })
    },
    Mutation: {
      createUser: async (root, args) => {
        const user = new User({ username: args.username, favoriteGenre: args.favoriteGenre })
        return user.save()
          .catch(error => {
            throw new GraphQLError('Creating the user failed', {
              extensions: {
                code: 'BAD_USER_INPUT',
                invalidArgs: args.username,
                error
              }
            })
          })
      },
      login: async (root, args) => {
        const user = await User.findOne({ username: args.username })
    
        if ( !user || args.password !== 'secret' ) {
          throw new GraphQLError('Wrong credentials', {
            extensions: {
              code: 'BAD_USER_INPUT'
            }
          })        
        }
    
        const userForToken = {
          username: user.username,
          id: user._id,
        }
    
        return { value: jwt.sign(userForToken, process.env.JWT_SECRET) }
      },
      addBook: async (root, args, context) => {
        const currentUser = context.currentUser
        if (!currentUser) {
          throw new GraphQLError('Not authenticated', {
            extensions: {
              code: 'BAD_USER_INPUT',
            }
          })
        }
  
        var authorId = null
        const author = await Author.find({name: args.author}) 
        if (author.length === 0) {
          const newAuthor = new Author({name: args.author})
          try {
            newAuthor.save()
          } catch (error) {
            throw new GraphQLError('Saving author failed', {
              extensions: {
                code: 'BAD_USER_INPUT',
                invalidArgs: args.author,
                error
              }
            })
          }
          authorId = newAuthor._id
        }
        else {
          authorId = author[0]._id
        }
        
        const newBook = new Book({...args, author: authorId})
        try {
          await newBook.save()
        } catch (error) {
          throw new GraphQLError('Saving book failed', {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.title,
              error
            }
          })
        }
  
        newBook.author.name = args.author

        pubsub.publish('BOOK_ADDED', { bookAdded: newBook })

        return newBook
      },
      editAuthor: async (root, args, { currentUser }) => {
        if (!currentUser) {
          throw new GraphQLError('Not authenticated', {
            extensions: {
              code: 'BAD_USER_INPUT',
            }
          })
        }
  
        var findAuthor = await Author.findOne({name: args.name})
        if (!findAuthor) {
          throw new GraphQLError('Cannot find author', {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.name,
            }
          })
        }
        else {
          findAuthor.born = args.setBornTo
          return findAuthor.save()
        }
      }
    },
    Subscription: {
      bookAdded: {
        subscribe: () => pubsub.asyncIterator('BOOK_ADDED')
      },
    },
}

module.exports = resolvers