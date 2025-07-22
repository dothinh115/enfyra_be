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

  it('should filter users where age > 30', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
    });
    for (const user of result.data) {
      expect(user.age).toBeGreaterThan(30);
    }
  });

  it('should sort users by age desc', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      sort: ['-age', '-id'],
    });
    const ages = result.data.map((u: any) => u.age);
    expect([...ages]).toEqual([...ages].sort((a, b) => b - a));
  });

  it('should deep load posts and comments', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      deep: {
        posts: { limit: 2 },
        posts__comments: { limit: 3 },
      },
    });
    for (const u of result.data) {
      if (u.posts) {
        expect(u.posts.length).toBeLessThanOrEqual(2);
        for (const p of u.posts) {
          expect(Array.isArray(p.comments)).toBe(true);
          // hoặc nếu bạn muốn kiểm tra có dữ liệu thì thêm:
          expect(p.comments.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('should return meta counts', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      meta: 'totalCount,filterCount',
    });
    expect(result.meta.totalCount).toBeGreaterThan(0);
    expect(result.meta.filterCount).toBeGreaterThan(0);
  });

  it('complex variant case 1', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 2', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 3', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 4', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 5', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 6', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 7', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 8', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 9', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 10', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 11', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 12', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 13', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 14', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 15', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 16', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 17', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 18', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 19', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 20', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 21', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 22', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 23', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 24', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 25', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 26', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 27', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 28', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 29', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 30', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 31', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 32', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 33', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 34', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 35', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 36', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 37', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 38', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 39', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 40', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 41', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 42', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 43', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 44', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 45', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 46', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 47', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 48', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 49', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 50', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 51', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 52', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 53', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 54', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 55', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 56', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 57', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 58', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 59', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 60', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 61', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 62', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 63', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 64', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 65', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 66', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 67', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 68', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 69', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 70', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 71', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 72', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 73', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 74', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 75', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 76', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 77', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 78', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 79', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 80', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 81', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 82', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 83', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 84', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 85', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 86', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 87', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 88', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 89', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 90', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 91', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 92', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 93', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 94', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 95', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 96', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 97', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 98', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 99', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 100', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 101', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 102', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 103', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 104', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 105', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 106', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 107', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 108', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 109', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 110', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 111', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 112', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 113', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 114', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 115', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 116', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 117', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 118', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 119', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 120', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 121', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 122', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 123', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 124', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 125', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 126', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 127', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 128', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 129', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 130', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 131', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 132', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 133', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 134', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 135', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 136', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 137', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 138', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 139', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 140', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 141', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 142', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 143', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 144', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 145', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 146', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 147', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 148', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 149', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 150', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 151', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 152', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 153', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 154', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 155', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 156', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 157', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 158', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 159', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 160', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 161', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 162', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 163', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 164', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 165', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 166', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 167', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 168', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 169', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 170', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 171', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 172', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 173', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 174', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 175', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 176', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 177', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 178', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 179', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 180', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 181', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 182', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 183', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 184', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 185', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 186', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 187', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 188', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 189', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 190', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 191', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 192', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 193', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 194', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 195', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 196', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 197', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 198', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 199', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 200', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 201', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 202', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 203', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 204', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 205', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 206', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 207', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 208', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 209', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 210', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 211', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 212', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 213', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 214', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 215', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 216', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 217', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 218', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 219', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 220', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 221', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 222', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 223', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 224', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 225', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 226', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 227', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 228', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 229', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 230', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 231', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 232', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 233', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 234', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 235', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 236', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 237', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 238', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 239', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 240', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 241', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 242', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 243', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 244', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 245', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 246', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 247', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 248', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 249', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 250', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 251', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 252', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 253', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 254', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 255', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 256', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 257', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 258', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 259', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 260', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 261', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 262', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 263', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 264', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 265', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 266', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 267', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 268', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 269', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 270', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 271', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 272', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 273', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 274', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 275', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 276', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 277', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 278', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 279', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 280', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 281', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 282', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 283', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 284', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 285', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 286', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 287', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 288', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 289', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 290', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 291', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 292', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 293', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 294', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 295', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 296', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 297', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 298', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 299', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 300', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 301', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 302', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 303', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 304', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 305', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 306', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 307', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 308', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 309', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 310', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 311', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 312', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 313', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 314', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 315', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 316', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 317', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 318', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 319', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 320', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 321', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 322', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 323', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 324', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 325', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 326', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 327', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 328', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 329', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 330', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 331', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 332', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 333', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 334', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 335', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 336', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 337', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 338', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 339', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 340', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 341', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 342', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 343', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 344', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 345', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 346', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 347', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 348', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 349', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 350', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 351', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 352', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 353', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 354', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 355', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 356', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 357', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 358', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 359', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 360', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 361', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 362', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 363', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 364', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 365', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 366', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 367', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 368', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 369', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 370', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 371', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 372', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 373', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 374', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 375', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 376', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 377', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 378', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 379', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 380', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 381', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 382', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 383', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 384', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 385', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 386', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 387', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 388', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 389', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 390', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 391', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 392', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 393', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 394', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 395', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 396', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 397', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 398', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 399', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 400', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 401', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 402', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 403', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 404', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 405', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 406', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 407', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 408', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 409', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 410', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 411', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 412', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 413', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 414', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 415', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 416', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 417', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 418', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 419', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 420', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 421', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 422', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 423', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 424', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 425', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 426', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 427', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 428', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 429', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 430', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 431', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 432', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 433', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 434', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 435', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 436', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 437', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 438', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 439', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 440', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 441', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 442', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 443', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 444', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 445', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 446', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 447', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 448', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 449', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 450', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 451', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 452', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 453', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 454', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 455', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 456', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 457', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 458', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 459', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 460', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 461', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 462', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 463', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 464', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 465', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 466', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 467', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 468', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 469', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 470', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 471', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 472', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 473', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 474', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 475', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 476', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 477', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 478', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 479', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 480', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 481', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 482', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 483', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 484', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 485', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 486', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 487', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 488', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 489', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 490', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 491', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 492', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 493', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 494', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 495', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 496', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 497', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 498', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 499', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 500', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 501', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 502', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 503', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 504', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 505', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 506', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 507', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 508', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 509', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 510', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 511', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 512', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 513', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 514', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 515', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 516', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 517', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 518', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 519', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 520', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 521', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 522', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 523', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 524', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 525', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 526', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 527', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 528', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 529', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 530', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 531', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 532', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 533', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 534', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 535', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 536', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 537', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 538', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 539', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 540', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 541', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 542', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 543', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 544', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 545', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 546', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 547', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 548', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 549', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 550', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 551', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 552', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 553', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 554', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 555', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 556', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 557', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 558', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 559', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 560', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 561', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 562', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 563', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 564', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 565', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 566', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 567', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 568', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 569', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 570', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 571', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 572', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 573', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 574', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 575', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 576', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 577', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 578', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 579', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 580', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 581', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 582', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 583', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 584', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 585', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 586', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 587', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 588', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 589', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 590', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 591', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 592', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 593', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 594', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 595', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 596', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 597', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 598', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 599', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 600', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 601', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 602', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 603', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 604', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 605', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 606', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 607', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 608', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 609', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 610', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 611', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 612', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 613', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 614', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 615', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 616', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 617', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 618', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 619', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 620', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 621', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 622', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 623', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 624', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 625', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 626', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 627', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 628', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 629', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 630', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 631', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 632', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 633', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 634', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 635', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 636', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 637', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 638', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 639', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 640', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 641', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 642', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 643', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 644', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 645', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 646', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 647', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 648', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 649', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 650', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 651', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 652', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 653', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 654', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 655', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 656', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 657', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 658', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 659', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 660', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 661', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 662', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 663', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 664', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 665', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 666', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 667', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 668', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 669', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 670', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 671', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 672', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 673', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 674', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 675', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 676', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 677', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 678', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 679', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 680', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 681', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 682', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 683', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 684', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 685', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 686', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 687', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 688', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 689', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 690', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 691', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 692', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 693', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 694', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 695', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 696', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 697', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 698', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 699', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 700', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 701', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 702', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 703', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 704', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 705', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 706', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 707', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 708', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 709', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 710', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 711', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 712', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 713', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 714', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 715', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 716', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 717', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 718', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 719', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 720', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 721', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 722', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 723', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 724', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 725', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 726', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 727', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 728', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 729', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 730', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 731', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 732', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 733', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 734', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 735', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 736', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 737', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 738', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 739', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 740', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 741', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 742', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 743', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 744', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 745', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 746', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 747', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 748', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 749', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 750', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 751', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 752', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 753', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 754', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 755', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 756', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 757', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 758', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 759', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 760', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 761', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 762', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 763', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 764', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 765', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 766', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 767', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 768', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 769', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 770', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 771', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 772', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 773', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 774', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 775', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 776', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 777', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 778', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 779', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 780', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 781', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 782', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 783', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 784', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 785', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 786', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 787', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 788', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 789', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 790', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 791', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 792', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 793', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 794', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 795', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 796', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 797', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 798', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 799', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 800', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 801', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 802', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 803', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 804', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 805', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 806', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 807', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 808', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 809', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 810', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 811', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 812', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 813', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 814', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 815', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 816', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 817', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 818', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 819', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 820', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 821', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 822', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 823', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 824', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 825', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 826', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 827', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 828', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 829', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 830', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 831', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 832', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 833', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 834', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 835', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 836', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 837', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 838', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 839', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 840', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 841', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 842', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 843', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 844', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 845', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 846', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 847', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 848', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 849', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 850', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 851', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 852', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 853', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 854', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 855', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 856', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 857', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 858', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 859', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 860', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 861', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 862', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 863', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 864', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 865', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 866', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 867', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 868', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 869', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 870', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 871', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 872', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 873', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 874', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 875', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 876', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 877', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 878', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 879', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 880', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 881', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 882', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 883', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 884', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 885', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 886', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 887', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 888', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 889', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 890', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 891', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 892', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 893', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 894', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 895', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 896', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 897', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 898', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 899', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 900', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 901', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 902', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 903', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 904', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 905', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 906', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 907', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 908', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 909', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 910', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 911', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 912', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 913', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 914', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 915', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 916', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 917', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 918', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 919', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 920', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 921', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 922', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 923', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 924', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 925', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 926', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 927', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 928', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 929', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 930', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 931', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 932', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 933', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 934', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 935', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 936', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 937', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 938', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 939', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 940', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 941', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 942', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 943', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 944', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 945', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 946', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 947', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 948', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 949', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 950', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 951', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 952', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 953', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 954', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 955', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 956', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 957', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 958', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 959', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 960', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 961', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 962', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 963', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 964', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 965', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 966', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 967', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 968', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 969', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 970', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 971', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 972', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 973', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 974', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 975', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 976', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 977', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 978', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 979', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 980', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 981', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 982', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 983', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 984', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 985', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 986', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 987', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 988', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 989', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 990', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 991', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _gt: 30 } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 992', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _count: { _gte: 3 } } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 993', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _sum: { views: { _gte: 10000 } } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 994', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _or: [{ age: { _lt: 25 } }, { age: { _gt: 45 } }] },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 995', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { comments: { _count: { _gt: 5 } } } },
      sort: ['-posts__views'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 996', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { _avg: { views: { _gt: 1000 } } } },
      sort: ['posts__title'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: {},
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 997', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { name: { _starts_with: 'User 1' } },
      sort: ['-age'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 998', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { age: { _between: [20, 40] } },
      sort: ['name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { limit: 2 }, posts__comments: { limit: 3 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 999', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { posts: { title: { _contains: 'Post' } } },
      sort: ['-age', 'name'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { sort: ['-views'], limit: 1 } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });

  it('complex variant case 1000', async () => {
    const result = await queryEngine.find({
      tableName: 'user',
      filter: { _not: { age: { _lt: 20 } } },
      sort: ['-id'],
      page: 1,
      limit: 10,
      meta: 'totalCount,filterCount',
      deep: { posts: { comments: { limit: 2 } } },
    });

    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeLessThanOrEqual(10);
    expect(typeof result.meta.totalCount).toBe('number');
    expect(typeof result.meta.filterCount).toBe('number');
  });
});
