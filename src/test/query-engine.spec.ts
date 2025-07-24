import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  DataSource,
} from 'typeorm';
import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import { QueryEngine } from '../query-engine/query-engine.service';
import { DataSourceService } from '../data-source/data-source.service';

@Entity('user')
class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  age: number;

  @OneToMany(() => Post, (post) => post.author)
  posts: Post[];
}

@Entity('post')
class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column()
  views: number;

  @ManyToOne(() => User, (user) => user.posts)
  author: User;

  @OneToMany(() => Comment, (comment) => comment.post)
  comments: Comment[];
}

@Entity('comment')
class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  content: string;

  @ManyToOne(() => Post, (post) => post.comments)
  post: Post;
}

describe('QueryEngine - Real Integration with DataSourceService', () => {
  let dataSource: DataSource;
  let queryEngine: QueryEngine;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      dropSchema: true,
      synchronize: true,
      entities: [User, Post, Comment],
    });
    await dataSource.initialize();

    // Seed data
    const userRepo = dataSource.getRepository(User);
    const postRepo = dataSource.getRepository(Post);
    const commentRepo = dataSource.getRepository(Comment);

    const users: User[] = [];
    for (let i = 1; i <= 200; i++) {
      const user = new User();
      user.name = `User ${i}`;
      user.age = 18 + (i % 50);
      users.push(user);
    }
    const savedUsers = await userRepo.save(users);

    const posts: Post[] = [];
    let postId = 1;
    for (const user of savedUsers) {
      for (let j = 0; j < 5; j++) {
        const post = new Post();
        post.title = `Post ${postId}`;
        post.views = Math.floor(Math.random() * 20000);
        post.author = user;
        posts.push(post);
        postId++;
      }
    }
    const savedPosts = await postRepo.save(posts);

    const comments: Comment[] = [];
    let commentId = 1;
    for (const post of savedPosts) {
      for (let k = 0; k < 5; k++) {
        const comment = new Comment();
        comment.content = `Comment ${commentId}`;
        comment.post = post;
        comments.push(comment);
        commentId++;
      }
    }
    await commentRepo.save(comments);

    // Create real DataSourceService
    const fakeCommonService = {
      loadDynamicEntities: async () => [User, Post, Comment],
    };
    const dsService = new DataSourceService(fakeCommonService as any);
    (dsService as any).dataSource = dataSource;
    for (const entity of [User, Post, Comment]) {
      const table = dataSource.getMetadata(entity).tableName;
      dsService.entityClassMap.set(table, entity);
    }

    queryEngine = new QueryEngine(dsService);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });
});
